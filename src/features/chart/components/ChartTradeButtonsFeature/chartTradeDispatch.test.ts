import assert from 'node:assert/strict';
import test from 'node:test';
import { dispatchChartTradeImmediately } from './chartTradeDispatch.ts';

type Submission = Readonly<{
  id: number;
  side: 'buy' | 'sell';
}>;

type CapturedRequest = Readonly<{
  trade: Submission;
  succeed: (ticket: string) => void;
  fail: (message: string) => void;
}>;

test('50 rapid chart trades dispatch before any earlier request settles', () => {
  const pendingIds: number[] = [];
  const terminalById = new Map<number, Readonly<{ status: 'done' | 'failed'; detail: string }>>();
  const requests: CapturedRequest[] = [];

  for (let id = 1; id <= 50; id += 1) {
    const trade: Submission = { id, side: id % 2 === 0 ? 'sell' : 'buy' };
    dispatchChartTradeImmediately({
      trade,
      emitPending: (acceptedTrade) => pendingIds.push(acceptedTrade.id),
      dispatch: (acceptedTrade) => {
        requests.push({
          trade: acceptedTrade,
          succeed: (ticket) => terminalById.set(acceptedTrade.id, { status: 'done', detail: ticket }),
          fail: (message) => terminalById.set(acceptedTrade.id, { status: 'failed', detail: message }),
        });
      },
    });
  }

  assert.equal(requests.length, 50, 'all 50 requests must start without waiting for request 1');
  assert.deepEqual(pendingIds, Array.from({ length: 50 }, (_, index) => index + 1));
  assert.equal(new Set(requests.map((request) => request.trade.id)).size, 50);
  assert.equal(terminalById.size, 0, 'no mocked request has settled yet');

  requests[49].succeed('ticket-50');
  requests[7].fail('rejected-8');
  requests[0].succeed('ticket-1');

  assert.deepEqual(terminalById.get(50), { status: 'done', detail: 'ticket-50' });
  assert.deepEqual(terminalById.get(8), { status: 'failed', detail: 'rejected-8' });
  assert.deepEqual(terminalById.get(1), { status: 'done', detail: 'ticket-1' });
  assert.equal(terminalById.size, 3, 'out-of-order results must settle only their own receipt');

  for (const request of requests) {
    if (terminalById.has(request.trade.id)) continue;
    if (request.trade.id % 2 === 0) request.fail(`rejected-${request.trade.id}`);
    else request.succeed(`ticket-${request.trade.id}`);
  }

  assert.equal(terminalById.size, 50);
  assert.equal(new Set(terminalById.keys()).size, 50);
});

test('a receipt presentation error cannot block broker dispatch', () => {
  let dispatchCalls = 0;

  assert.doesNotThrow(() => {
    dispatchChartTradeImmediately({
      trade: { id: 1, side: 'buy' as const },
      emitPending: () => {
        throw new Error('receipt host unavailable');
      },
      dispatch: () => {
        dispatchCalls += 1;
      },
    });
  });

  assert.equal(dispatchCalls, 1);
});
