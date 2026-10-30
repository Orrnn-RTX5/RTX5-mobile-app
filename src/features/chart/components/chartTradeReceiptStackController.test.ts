import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import {
  createChartTradeReceiptStackController,
  reduceChartTradeReceiptStack,
  type ChartTradeQueueEvent,
  type ChartTradeQueueFeedback,
  type ChartTradeReceiptSnapshot,
} from './chartTradeReceiptStackController';

const RAPID_TRADE_COUNT = 100;
const SHARED_EXECUTED_AT = '2026-08-08T12:34:56.789Z';

const pendingEvent = (queueId: number): ChartTradeQueueEvent => ({
  queueId,
  status: 'pending',
  side: 'sell',
  symbol: 'BTCUSD',
  volume: 0.01,
});

const sharedConfirmedFeedback: ChartTradeQueueFeedback = {
  visible: true,
  type: 'success',
  side: 'sell',
  symbol: 'BTCUSD',
  ticket: 'same-ticket-for-identity-stress',
  price: 116_250.25,
  volume: 0.01,
  executedAt: SHARED_EXECUTED_AT,
  executionConfirmed: true,
};

const confirmedEvent = (queueId: number): ChartTradeQueueEvent => ({
  ...pendingEvent(queueId),
  status: 'confirmed',
  feedback: sharedConfirmedFeedback,
});

const buildPendingSnapshot = (count = RAPID_TRADE_COUNT): ChartTradeReceiptSnapshot => {
  let snapshot: ChartTradeReceiptSnapshot = [];
  for (let queueId = 1; queueId <= count; queueId += 1) {
    snapshot = reduceChartTradeReceiptStack(snapshot, pendingEvent(queueId));
  }
  return snapshot;
};

const queueIds = (snapshot: ChartTradeReceiptSnapshot): number[] =>
  snapshot.map((entry) => entry.queueId);

test('100 rapid pending trades are never truncated and remain in click order from top to bottom', () => {
  const snapshot = buildPendingSnapshot();
  const ids = queueIds(snapshot);

  assert.equal(snapshot.length, RAPID_TRADE_COUNT);
  assert.equal(new Set(ids).size, RAPID_TRADE_COUNT);
  assert.equal(ids[0], 1, 'the first trade must remain at the top');
  assert.equal(ids.at(-1), RAPID_TRADE_COUNT, 'the newest trade must appear at the bottom');
  assert.deepEqual(ids, Array.from({ length: RAPID_TRADE_COUNT }, (_, index) => index + 1));
});

test('100 out-of-order confirmations settle by queue identity without changing click order', () => {
  let snapshot = buildPendingSnapshot();
  const originalOrder = queueIds(snapshot);

  for (let queueId = RAPID_TRADE_COUNT; queueId >= 1; queueId -= 1) {
    snapshot = reduceChartTradeReceiptStack(snapshot, confirmedEvent(queueId));
    assert.deepEqual(queueIds(snapshot), originalOrder, `confirmation ${queueId} must update its existing row`);
  }

  assert.deepEqual(queueIds(snapshot), originalOrder);
  assert.equal(new Set(queueIds(snapshot)).size, RAPID_TRADE_COUNT);
  for (const receipt of snapshot) {
    assert.equal(receipt.status, 'confirmed');
    assert.equal(receipt.feedback, sharedConfirmedFeedback);
    assert.equal(receipt.feedback?.executedAt, SHARED_EXECUTED_AT);
    assert.equal(receipt.symbol, 'BTCUSD');
    assert.equal(receipt.side, 'sell');
    assert.equal(receipt.volume, 0.01);
  }
});

test('arbitrary dismissals remove only their queue IDs and leave the other 97 unchanged', () => {
  const controller = createChartTradeReceiptStackController();
  const dismissedIds = new Set([3, 51, 88]);

  try {
    for (let queueId = 1; queueId <= RAPID_TRADE_COUNT; queueId += 1) {
      controller.applyEvent(pendingEvent(queueId));
    }
    const before = controller.getSnapshot();

    dismissedIds.forEach((queueId) => controller.dismiss(queueId));

    const after = controller.getSnapshot();
    assert.equal(after.length, 97);
    assert.deepEqual(
      queueIds(after),
      queueIds(before).filter((queueId) => !dismissedIds.has(queueId)),
    );
    for (const receipt of after) {
      assert.equal(
        receipt,
        before.find((candidate) => candidate.queueId === receipt.queueId),
        `queue ${receipt.queueId} must retain its object identity`,
      );
    }
  } finally {
    controller.dispose();
  }
});

test('cancelled removes exactly its pending receipt', () => {
  const before = buildPendingSnapshot(5);
  const cancelled = reduceChartTradeReceiptStack(before, {
    ...pendingEvent(3),
    status: 'cancelled',
  });

  assert.deepEqual(queueIds(cancelled), [1, 2, 4, 5]);
  assert.equal(cancelled.length, before.length - 1);
  for (const receipt of cancelled) {
    assert.equal(
      receipt,
      before.find((candidate) => candidate.queueId === receipt.queueId),
      `cancelling queue 3 must not replace queue ${receipt.queueId}`,
    );
  }
});

test('failed and unconfirmed events update only their exact queue IDs', () => {
  const pending = buildPendingSnapshot(5);
  const failedFeedback: ChartTradeQueueFeedback = {
    visible: true,
    type: 'error',
    title: 'Order failed',
    message: 'Rejected by broker',
    executionConfirmed: false,
  };
  const unconfirmedFeedback: ChartTradeQueueFeedback = {
    visible: true,
    type: 'error',
    title: 'Execution unconfirmed',
    message: 'Verify the position before retrying',
    executionConfirmed: false,
  };

  const withFailure = reduceChartTradeReceiptStack(pending, {
    ...pendingEvent(2),
    status: 'failed',
    feedback: failedFeedback,
  });
  const settled = reduceChartTradeReceiptStack(withFailure, {
    ...pendingEvent(4),
    status: 'unconfirmed',
    feedback: unconfirmedFeedback,
  });

  assert.deepEqual(queueIds(settled), queueIds(pending));
  assert.equal(settled.find((entry) => entry.queueId === 2)?.status, 'failed');
  assert.equal(settled.find((entry) => entry.queueId === 2)?.feedback, failedFeedback);
  assert.equal(settled.find((entry) => entry.queueId === 4)?.status, 'unconfirmed');
  assert.equal(settled.find((entry) => entry.queueId === 4)?.feedback, unconfirmedFeedback);
  for (const queueId of [1, 3, 5]) {
    assert.equal(
      settled.find((entry) => entry.queueId === queueId),
      pending.find((entry) => entry.queueId === queueId),
      `queue ${queueId} must remain untouched`,
    );
  }
});

test('terminal timers independently dismiss only their own rows and dispose cleanly', () => {
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  const scheduled = new Map<number, {
    callback: () => void;
    delay: number | undefined;
    cleared: boolean;
  }>();
  let nextTimerId = 1;

  globalThis.setTimeout = ((callback: (...args: any[]) => void, delay?: number) => {
    const timerId = nextTimerId;
    nextTimerId += 1;
    scheduled.set(timerId, {
      callback: () => callback(),
      delay,
      cleared: false,
    });
    return timerId as unknown as ReturnType<typeof setTimeout>;
  }) as typeof setTimeout;
  globalThis.clearTimeout = ((timer: ReturnType<typeof setTimeout>) => {
    const scheduledTimer = scheduled.get(Number(timer));
    if (scheduledTimer) scheduledTimer.cleared = true;
  }) as typeof clearTimeout;

  try {
    const controller = createChartTradeReceiptStackController({ terminalDismissMs: 7 });
    for (let queueId = 1; queueId <= 4; queueId += 1) {
      controller.applyEvent(pendingEvent(queueId));
    }

    controller.applyEvent(confirmedEvent(1));
    controller.applyEvent({
      ...pendingEvent(2),
      status: 'failed',
      feedback: { visible: true, type: 'error', message: 'failed' },
    });
    controller.applyEvent({
      ...pendingEvent(3),
      status: 'unconfirmed',
      feedback: { visible: true, type: 'error', message: 'unconfirmed' },
    });

    assert.equal(scheduled.size, 3);
    assert.deepEqual([...scheduled.values()].map((timer) => timer.delay), [7, 7, 7]);

    scheduled.get(2)?.callback();
    assert.deepEqual(queueIds(controller.getSnapshot()), [1, 3, 4]);

    scheduled.get(1)?.callback();
    assert.deepEqual(queueIds(controller.getSnapshot()), [3, 4]);

    controller.applyEvent(confirmedEvent(4));
    assert.equal(scheduled.size, 4);
    controller.dispose();

    assert.deepEqual(controller.getSnapshot(), []);
    assert.equal(scheduled.get(3)?.cleared, true, 'queue 3 timer must be cleared on dispose');
    assert.equal(scheduled.get(4)?.cleared, true, 'queue 4 timer must be cleared on dispose');

    scheduled.get(3)?.callback();
    scheduled.get(4)?.callback();
    assert.deepEqual(controller.getSnapshot(), [], 'disposed callbacks must be harmless');
  } finally {
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }
});

test('controller source has no receipt-count cap or truncating slice', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/features/chart/components/chartTradeReceiptStackController.ts'),
    'utf8',
  );

  assert.doesNotMatch(source, /\.slice\(\s*0\s*,/);
  assert.doesNotMatch(
    source,
    /\b(?:MAX|LIMIT|CAP)[A-Z0-9_]*(?:RECEIPT|STACK|ROW|TRADE)[A-Z0-9_]*\s*=/i,
  );
  assert.doesNotMatch(
    source,
    /\b(?:RECEIPT|STACK|ROW|TRADE)[A-Z0-9_]*(?:MAX|LIMIT|CAP)[A-Z0-9_]*\s*=/i,
  );
  assert.match(source, /const next = snapshot\.slice\(\);/);
});

test('pendingDismissMs starts each popup 1s timer on click and never leaves popups stuck', () => {
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  const scheduled = new Map<number, {
    callback: () => void;
    delay: number | undefined;
    cleared: boolean;
  }>();
  let nextTimerId = 1;

  globalThis.setTimeout = ((callback: (...args: any[]) => void, delay?: number) => {
    const timerId = nextTimerId++;
    scheduled.set(timerId, {
      callback: () => callback(),
      delay,
      cleared: false,
    });
    return timerId as unknown as ReturnType<typeof setTimeout>;
  }) as typeof setTimeout;
  globalThis.clearTimeout = ((timer: ReturnType<typeof setTimeout>) => {
    const scheduledTimer = scheduled.get(Number(timer));
    if (scheduledTimer) scheduledTimer.cleared = true;
  }) as typeof clearTimeout;

  try {
    const controller = createChartTradeReceiptStackController({
      pendingDismissMs: 1_000,
      terminalDismissMs: 1_000,
    });
    controller.applyEvent(pendingEvent(1));
    controller.applyEvent(pendingEvent(2));
    assert.equal(scheduled.size, 2);
    assert.deepEqual([...scheduled.values()].map((t) => t.delay), [1_000, 1_000]);

    // Confirming within the 1s window replaces the pending timer with a full 1s terminal timer.
    controller.applyEvent(confirmedEvent(1));
    assert.equal(scheduled.size, 3);
    assert.equal(scheduled.get(1)?.cleared, true);
    assert.equal(scheduled.get(3)?.delay, 1_000);
    assert.equal(controller.getSnapshot()[0]?.status, 'confirmed');

    // Expiring in click sequence removes popups one by one after 1 second.
    scheduled.get(3)?.callback();
    assert.deepEqual(queueIds(controller.getSnapshot()), [2]);
    scheduled.get(2)?.callback();
    assert.deepEqual(queueIds(controller.getSnapshot()), []);
    controller.dispose();
  } finally {
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }
});
