import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { resolve } from 'node:path';

import {
  buildClosePositionRequestDescriptor,
  buildFullClosePositionRequestPayload,
  buildPartialClosePositionRequestPayload,
  normalizeClosePositionTicket,
} from './closePayload';
import {
  executeClosePositionRequest,
  normalizeClosePositionResponse,
  type ClosePositionExecutionDeps,
} from './closeSubmission';
import { CLIENT_ORDER_ID_PATTERN } from '../tradeIdempotency';
import { classifyTradingError } from '../tradingErrors';

const positionsApiSource = readFileSync(resolve(process.cwd(), 'src/api/positions/index.ts'), 'utf8');
const closePayloadSource = readFileSync(resolve(process.cwd(), 'src/api/positions/closePayload.ts'), 'utf8');

// Contract v3 6.2 example 200 body: order_ticket / deal_ticket are STRINGS.
const CLOSE_200 = {
  client_order_id: 'close-2002-6f1c2c1e-6c2a-4c4f-9f3e-2b8f1d9a0c11',
  ticket: 2002,
  symbol: 'EURUSD',
  side: 'buy',
  volume_closed: 0.01,
  volume_total: 0.01,
  price_open: 1.13745,
  price_close: 1.1376,
  profit: 0.15,
  swap: 0,
  partial: false,
  status: 'closed',
  time: 1790241600,
  order_ticket: '1003',
  deal_ticket: '5005',
  state_version: '4',
  command_id: 'cmd-1',
};

const FIXED_ID = 'close-2002-6f1c2c1e-6c2a-4c4f-9f3e-2b8f1d9a0c11';

const deps = (
  overrides: Partial<ClosePositionExecutionDeps> & { sendResult?: { status: number; body: unknown } },
) => {
  const sent: string[] = [];
  const value: ClosePositionExecutionDeps = {
    send: overrides.send ?? (async (descriptor) => {
      sent.push(descriptor.body);
      return overrides.sendResult ?? { status: 200, body: CLOSE_200 };
    }),
    pollCommand: overrides.pollCommand ?? (async () => ({ kind: 'pending' as const })),
    readOpenTickets: overrides.readOpenTickets ?? (async () => ['2002']),
  };
  return { value, sent };
};

test('full close sends only client_order_id (mode is dropped)', () => {
  const request = buildFullClosePositionRequestPayload();
  assert.deepEqual(request.body, {});
  assert.equal(request.journalPayload, undefined);

  const descriptor = buildClosePositionRequestDescriptor(2002, request, FIXED_ID);
  assert.equal(descriptor.body, `{"client_order_id":"${FIXED_ID}"}`);
  assert.doesNotMatch(descriptor.body, /mode/);
});

test('partial close sends volume as a JSON number, never a string', () => {
  const numericRequest = buildPartialClosePositionRequestPayload(0.03);
  const decimalRequest = buildPartialClosePositionRequestPayload('0.0100');

  assert.deepEqual(numericRequest.body, { volume: 0.03 });
  assert.deepEqual(numericRequest.journalPayload, { volume: 0.03 });
  assert.deepEqual(decimalRequest.body, { volume: 0.01 });
  assert.equal(typeof (decimalRequest.body as { volume: unknown }).volume, 'number');

  const descriptor = buildClosePositionRequestDescriptor(2002, decimalRequest, FIXED_ID);
  assert.equal(descriptor.body, `{"client_order_id":"${FIXED_ID}","volume":0.01}`);
  assert.doesNotMatch(descriptor.body, /"volume":"/);
});

test('invalid partial volume throws instead of falling back to a full close', () => {
  for (const volume of [0, -0.01, Number.NaN, Number.POSITIVE_INFINITY, '', ' ', 'zero', '-0.01']) {
    assert.throws(
      () => buildPartialClosePositionRequestPayload(volume),
      /positive number or decimal string/,
    );
  }
});

test('close paths accept only positive broker ticket values', () => {
  assert.equal(normalizeClosePositionTicket(67890), '67890');
  assert.equal(normalizeClosePositionTicket('9223372036854775807'), '9223372036854775807');

  for (const ticket of [0, -1, 1.5, Number.NaN, '', 'position-row-id', '0']) {
    assert.throws(
      () => normalizeClosePositionTicket(ticket),
      /positive broker ticket/,
    );
  }
});

test('generated close ids use close-<ticket>-<uuid> and match the server pattern', () => {
  for (const ticket of [2002, '9223372036854775807']) {
    const descriptor = buildClosePositionRequestDescriptor(ticket, buildFullClosePositionRequestPayload());
    assert.match(descriptor.clientOrderId, new RegExp(`^close-${ticket}-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`));
    assert.match(descriptor.clientOrderId, CLIENT_ORDER_ID_PATTERN);
    assert.equal(JSON.parse(descriptor.body).client_order_id, descriptor.clientOrderId);
    assert.equal(descriptor.endpoint, `/positions/${ticket}/close`);
    assert.equal(descriptor.method, 'POST');
  }
  const first = buildClosePositionRequestDescriptor(2002, buildFullClosePositionRequestPayload());
  const second = buildClosePositionRequestDescriptor(2002, buildFullClosePositionRequestPayload());
  assert.notEqual(first.clientOrderId, second.clientOrderId, 'each user close action gets its own id');
});

test('200 close parses string order/deal tickets from the contract example', async () => {
  const descriptor = buildClosePositionRequestDescriptor(2002, buildFullClosePositionRequestPayload(), FIXED_ID);
  const { value } = deps({});
  const result = await executeClosePositionRequest(descriptor, value);
  assert.equal(result.status, 'closed');
  assert.equal(result.order_ticket, '1003');
  assert.equal(result.deal_ticket, '5005');
  assert.equal(result.state_version, '4');
  assert.equal(result.ticket, 2002);

  const partial = normalizeClosePositionResponse(
    { ...CLOSE_200, status: 'partial_closed', partial: true, order_ticket: 1004 },
    '2002',
  );
  assert.equal(partial.status, 'partial_closed');
  assert.equal(partial.order_ticket, '1004');
});

test('409 POSITION_ALREADY_CLOSED is treated as a completed close', async () => {
  const descriptor = buildClosePositionRequestDescriptor(2002, buildFullClosePositionRequestPayload(), FIXED_ID);
  const { value } = deps({
    sendResult: {
      status: 409,
      body: { error: 'POSITION_ALREADY_CLOSED', message: 'Position already closed' },
    },
  });
  const result = await executeClosePositionRequest(descriptor, value);
  assert.equal(result.status, 'closed');
  assert.equal(result.already_closed, true);
});

test('503 ENGINE_CLOSE_UNAVAILABLE is surfaced once with the support message', async () => {
  const descriptor = buildClosePositionRequestDescriptor(2002, buildFullClosePositionRequestPayload(), FIXED_ID);
  let sends = 0;
  const { value } = deps({
    send: async () => {
      sends += 1;
      return {
        status: 503,
        body: { error: 'ENGINE_CLOSE_UNAVAILABLE', message: 'engine close unavailable' },
      };
    },
  });
  const error = await executeClosePositionRequest(descriptor, value).then(
    () => assert.fail('expected rejection'),
    (reason: unknown) => reason,
  );
  assert.equal(sends, 1, 'no retry loop');
  const feedback = classifyTradingError(error, { action: 'close-position', brokerId: 'trivanta-markets' });
  assert.equal(feedback.message, 'Closing is temporarily unavailable, please contact support.');
});

test('202 close is confirmed by polling order-commands', async () => {
  const descriptor = buildClosePositionRequestDescriptor(2002, buildFullClosePositionRequestPayload(), FIXED_ID);
  const polled: string[] = [];
  const { value } = deps({
    sendResult: {
      status: 202,
      body: { type: 'order_accepted', status: 'accepted', success: true, client_order_id: FIXED_ID },
    },
    pollCommand: async (id) => {
      polled.push(id);
      return { kind: 'filled', data: CLOSE_200 };
    },
  });
  const result = await executeClosePositionRequest(descriptor, value);
  assert.deepEqual(polled, [FIXED_ID]);
  assert.equal(result.deal_ticket, '5005');
});

test('202 close that is rejected, or already closed, while polling', async () => {
  const descriptor = buildClosePositionRequestDescriptor(2002, buildFullClosePositionRequestPayload(), FIXED_ID);
  const accepted = { status: 202, body: { type: 'order_accepted', status: 'accepted' } };
  await assert.rejects(
    executeClosePositionRequest(descriptor, deps({
      sendResult: accepted,
      pollCommand: async () => ({ kind: 'rejected', code: 'NO_FRESH_QUOTE', message: 'no quote', retryable: true }),
    }).value),
    (error: unknown) => (error as { data?: { error?: string } }).data?.error === 'NO_FRESH_QUOTE',
  );
  const done = await executeClosePositionRequest(descriptor, deps({
    sendResult: accepted,
    pollCommand: async () => ({
      kind: 'rejected',
      code: 'POSITION_ALREADY_CLOSED',
      message: 'closed',
      retryable: false,
    }),
  }).value);
  assert.equal(done.already_closed, true);
});

test('202 close that never becomes final reconciles against GET /positions', async () => {
  const descriptor = buildClosePositionRequestDescriptor(2002, buildFullClosePositionRequestPayload(), FIXED_ID);
  const accepted = { status: 202, body: { type: 'order_accepted', status: 'accepted' } };

  const gone = await executeClosePositionRequest(descriptor, deps({
    sendResult: accepted,
    readOpenTickets: async () => ['3003'],
  }).value);
  assert.equal(gone.status, 'closed');
  assert.equal(gone.confirmed_by, 'reconciliation');

  const stillOpen = await executeClosePositionRequest(descriptor, deps({
    sendResult: accepted,
    readOpenTickets: async () => ['2002'],
  }).value).then(
    () => assert.fail('expected Confirmation Pending'),
    (reason: unknown) => reason,
  );
  assert.equal(
    classifyTradingError(stillOpen, { action: 'close-position', brokerId: 'Orrnn' }).title,
    'Confirmation Pending',
  );
});

test('positions API routes full and partial close through one submitter with a >= 30 s budget', () => {
  assert.match(positionsApiSource, /const submitClosePositionRequest = async \(/);
  assert.match(positionsApiSource, /buildClosePositionRequestDescriptor\(ticketId, request\)/);
  assert.match(positionsApiSource, /executeClosePositionRequest\(descriptor, \{/);
  assert.match(
    positionsApiSource,
    /apiClient\(prepared\.endpoint, \{[\s\S]*method: prepared\.method,[\s\S]*'Idempotency-Key': prepared\.clientOrderId[\s\S]*body: prepared\.body,[\s\S]*timeoutMs: CLOSE_POSITION_HTTP_TIMEOUT_MS,/,
  );
  const timeout = positionsApiSource.match(/CLOSE_POSITION_HTTP_TIMEOUT_MS = ([\d_]+)/);
  assert.ok(timeout && Number(timeout[1].replace(/_/g, '')) >= 30_000);
  assert.match(
    positionsApiSource,
    /closePosition: async \(ticketId: string \| number\)[\s\S]*buildFullClosePositionRequestPayload\(\)/,
  );
  assert.match(
    positionsApiSource,
    /closePositionPartial: async \([\s\S]*buildPartialClosePositionRequestPayload\(volume\)/,
  );
  assert.doesNotMatch(closePayloadSource, /ticket_by|ticketBy/);
  assert.doesNotMatch(closePayloadSource, /mode: 'full'/);
});

test('open positions are read without limit/offset paging', () => {
  const getPositionsSource = positionsApiSource.slice(
    positionsApiSource.indexOf('getPositions: async'),
    positionsApiSource.indexOf('getPositionsForReconciliation: async'),
  );
  assert.match(getPositionsSource, /getPositions: async \(login: number\): Promise<Position\[\]>/);
  assert.match(getPositionsSource, /const url = `\/positions\/\$\{login\}`;/);
  assert.doesNotMatch(getPositionsSource, /limit|offset/);
});
