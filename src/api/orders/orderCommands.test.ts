import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ORDER_COMMAND_POLL_INTERVAL_MS,
  ORDER_COMMAND_POLL_TIMEOUT_MS,
  buildOrderCommandPath,
  createOrderCommandRejectedError,
  createOrderConfirmationPendingError,
  isOrderAcceptedResponse,
  parseOrderCommandResult,
  pollOrderCommand,
  type OrderCommandPollResponse,
} from './orderCommands';
import { classifyTradingError } from '../tradingErrors';

// Contract v3 6.1 example payloads.
const ACCEPTED_202 = {
  type: 'order_accepted',
  status: 'accepted',
  success: true,
  client_order_id: 'order-6f1c2c1e-6c2a-4c4f-9f3e-2b8f1d9a0c11',
  accepted_at: 1790241500123,
};
const FILL = {
  order_ticket: 1001,
  position_ticket: 2002,
  symbol: 'EURUSD',
  side: 'buy',
  volume: 0.01,
  price: 1.13745,
  commission: 0,
  status: 'filled',
  time: 1790241500,
  action: 'opened',
};

const fakeClock = () => {
  let now = 0;
  return {
    now: () => now,
    sleep: async (ms: number) => {
      now += ms;
    },
  };
};

test('poll timing matches the contract: every 500 ms for up to 30 s', () => {
  assert.equal(ORDER_COMMAND_POLL_INTERVAL_MS, 500);
  assert.equal(ORDER_COMMAND_POLL_TIMEOUT_MS, 30_000);
});

test('202 order_accepted is recognised by status code or body shape', () => {
  assert.equal(isOrderAcceptedResponse(202, ACCEPTED_202), true);
  assert.equal(isOrderAcceptedResponse(202, null), true);
  assert.equal(isOrderAcceptedResponse(200, ACCEPTED_202), true);
  assert.equal(isOrderAcceptedResponse(200, FILL), false);
});

test('poll results parse order_filled and order_rejected; anything else is not final', () => {
  assert.deepEqual(parseOrderCommandResult({ type: 'order_filled', data: FILL }), {
    kind: 'filled',
    data: FILL,
  });
  assert.deepEqual(
    parseOrderCommandResult({
      type: 'order_rejected',
      error: { code: 'insufficient_margin', message: 'Not enough margin', retryable: false },
    }),
    { kind: 'rejected', code: 'INSUFFICIENT_MARGIN', message: 'Not enough margin', retryable: false },
  );
  assert.deepEqual(parseOrderCommandResult({ type: 'order_rejected' }), {
    kind: 'rejected',
    code: 'ORDER_REJECTED',
    message: 'The order was rejected by the trading server.',
    retryable: false,
  });
  assert.equal(parseOrderCommandResult(ACCEPTED_202), null);
  assert.equal(parseOrderCommandResult({ error: 'ORDER_COMMAND_NOT_FOUND', message: 'x' }), null);
  assert.equal(parseOrderCommandResult(null), null);
});

test('the poll path carries the client_order_id and account_login', () => {
  assert.equal(
    buildOrderCommandPath('order-6f1c2c1e-6c2a-4c4f-9f3e-2b8f1d9a0c11', 200074),
    '/order-commands/order-6f1c2c1e-6c2a-4c4f-9f3e-2b8f1d9a0c11?account_login=200074',
  );
});

test('polling returns the fill once the command is final, tolerating 404 and transport errors', async () => {
  const clock = fakeClock();
  const responses: Array<OrderCommandPollResponse | Error> = [
    { status: 404, body: { error: 'ORDER_COMMAND_NOT_FOUND', message: 'not yet' } },
    new Error('Network request failed'),
    { status: 200, body: ACCEPTED_202 },
    { status: 200, body: { type: 'order_filled', data: FILL } },
  ];
  const paths: string[] = [];
  const outcome = await pollOrderCommand({
    clientOrderId: 'order-abc12345',
    accountLogin: '200074',
    now: clock.now,
    sleep: clock.sleep,
    fetchCommand: async (path) => {
      paths.push(path);
      const next = responses.shift();
      if (next instanceof Error) throw next;
      return next!;
    },
  });
  assert.deepEqual(outcome, { kind: 'filled', data: FILL });
  assert.equal(paths.length, 4);
  assert.equal(paths[0], '/order-commands/order-abc12345?account_login=200074');
  assert.equal(clock.now(), 4 * 500);
});

test('polling stops at 30 s with a pending outcome', async () => {
  const clock = fakeClock();
  let calls = 0;
  const outcome = await pollOrderCommand({
    clientOrderId: 'order-abc12345',
    accountLogin: 200074,
    now: clock.now,
    sleep: clock.sleep,
    fetchCommand: async () => {
      calls += 1;
      return { status: 200, body: ACCEPTED_202 };
    },
  });
  assert.deepEqual(outcome, { kind: 'pending' });
  assert.equal(calls, 60);
  assert.ok(clock.now() >= 30_000);
});

test('a session change aborts polling', async () => {
  const clock = fakeClock();
  let calls = 0;
  await assert.rejects(
    pollOrderCommand({
      clientOrderId: 'order-abc12345',
      accountLogin: 200074,
      now: clock.now,
      sleep: clock.sleep,
      assertCurrent: () => {
        if (calls >= 2) throw new Error('stale session');
      },
      fetchCommand: async () => {
        calls += 1;
        return { status: 200, body: ACCEPTED_202 };
      },
    }),
    /stale session/,
  );
});

test('rejections and pending outcomes surface as trading errors', () => {
  const rejected = createOrderCommandRejectedError({
    kind: 'rejected',
    code: 'MARKET_CLOSED',
    message: 'Market closed',
    retryable: false,
  });
  const rejectedFeedback = classifyTradingError(rejected, { action: 'place-order', brokerId: 'Orrnn' });
  assert.equal(rejectedFeedback.title, 'Market Closed');

  const pending = createOrderConfirmationPendingError('order-abc12345');
  const pendingFeedback = classifyTradingError(pending, { action: 'place-order', brokerId: 'Orrnn' });
  assert.equal(pendingFeedback.title, 'Confirmation Pending');
  assert.match(pendingFeedback.message, /Check your positions/);
});
