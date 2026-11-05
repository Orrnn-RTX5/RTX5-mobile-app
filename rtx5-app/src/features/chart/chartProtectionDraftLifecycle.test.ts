import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildChartProtectionPositionSignature,
  createChartProtectionDraftId,
  hasChartProtectionDraftReconciled,
  publishChartProtectionDraftExecution,
  publishChartProtectionDraftSubmission,
  releaseChartProtectionDraftSubmission,
  subscribeChartProtectionDraftExecution,
  subscribeChartProtectionDraftSubmission,
  tryBeginChartProtectionDraftSubmission,
  type ChartProtectionDraftExecutionEvent,
} from './chartProtectionDraftLifecycle';

test('chart protection draft ids remain unique within one chart session scope', () => {
  const first = createChartProtectionDraftId('broker:login:XAUUSD');
  const second = createChartProtectionDraftId('broker:login:XAUUSD');

  assert.notEqual(first, second);
  assert.match(first, /^broker:login:XAUUSD:/);
});

test('only one Market Execution submission can own a protection draft', () => {
  const draftId = createChartProtectionDraftId('broker:login:XAUUSD');

  assert.equal(tryBeginChartProtectionDraftSubmission(draftId), true);
  assert.equal(tryBeginChartProtectionDraftSubmission(draftId), false);
  releaseChartProtectionDraftSubmission(draftId);
  assert.equal(tryBeginChartProtectionDraftSubmission(draftId), true);
  releaseChartProtectionDraftSubmission(draftId);
});

test('chart protection submission events identify the exact draft and unsubscribe', () => {
  const draftIds: string[] = [];
  const unsubscribe = subscribeChartProtectionDraftSubmission((draftId) => {
    draftIds.push(draftId);
  });

  publishChartProtectionDraftSubmission(' draft-1 ');
  unsubscribe();
  publishChartProtectionDraftSubmission('draft-2');

  assert.deepEqual(draftIds, ['draft-1']);
});

test('pre-existing ticket presence does not confirm an unconfirmed netting submission', () => {
  const position = {
    symbol: 'XAUUSD',
    side: 'buy',
    volume: 1,
    openPrice: 4053.25,
    sl: 4050,
    tp: 4060,
    openTime: '2026-07-24T00:00:00.000Z',
  } as const;
  const baselineSignature = buildChartProtectionPositionSignature(position);

  assert.equal(
    hasChartProtectionDraftReconciled({
      baselineSignature,
      currentPosition: position,
      terminalTicketObserved: false,
    }),
    false,
  );
  assert.equal(
    hasChartProtectionDraftReconciled({
      baselineSignature,
      currentPosition: { ...position, volume: 2 },
      terminalTicketObserved: false,
    }),
    true,
  );
});

test('new-ticket presence or exact terminal history reconciles the draft', () => {
  const position = {
    symbol: 'XAUUSD',
    side: 'buy',
    volume: 1,
    openPrice: 4053.25,
  } as const;

  assert.equal(
    hasChartProtectionDraftReconciled({
      currentPosition: position,
      terminalTicketObserved: false,
    }),
    true,
  );
  assert.equal(
    hasChartProtectionDraftReconciled({
      currentPosition: null,
      terminalTicketObserved: true,
    }),
    true,
  );
});

test('chart protection execution events are exact-draft and unsubscribe cleanly', () => {
  const events: ChartProtectionDraftExecutionEvent[] = [];
  const unsubscribe = subscribeChartProtectionDraftExecution((event) => {
    events.push(event);
  });

  publishChartProtectionDraftExecution({
    draftId: ' draft-1 ',
    executionConfirmed: false,
    ticket: ' 123 ',
  });
  unsubscribe();
  publishChartProtectionDraftExecution({
    draftId: 'draft-2',
    executionConfirmed: true,
  });

  assert.deepEqual(events, [{
    draftId: 'draft-1',
    executionConfirmed: false,
    ticket: '123',
  }]);
});
