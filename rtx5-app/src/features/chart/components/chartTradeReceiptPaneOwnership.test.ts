import assert from 'node:assert/strict';
import test from 'node:test';

import {
  reduceChartTradeReceiptStack,
  selectChartTradeReceiptSnapshotForPane,
  type ChartTradeQueueEvent,
  type ChartTradeReceiptSnapshot,
} from './chartTradeReceiptStackController';

const pendingEvent = (
  queueId: number,
  chartWindowPaneId: string,
  symbol: string,
): ChartTradeQueueEvent => ({
  queueId,
  status: 'pending',
  side: 'buy',
  symbol,
  volume: 0.03,
  chartWindowPaneId,
});

const applyEvents = (
  events: readonly ChartTradeQueueEvent[],
): ChartTradeReceiptSnapshot => events.reduce<ChartTradeReceiptSnapshot>(
  (snapshot, event) => reduceChartTradeReceiptStack(snapshot, event),
  [],
);

test('simultaneous different-symbol receipts remain in their originating panes', () => {
  const xauusd = pendingEvent(1, 'chart-window-1', 'XAUUSD');
  const btcusd = pendingEvent(2, 'chart-window-2', 'BTCUSD');
  const snapshot = applyEvents([xauusd, btcusd]);

  const firstPane = selectChartTradeReceiptSnapshotForPane(
    snapshot,
    'chart-window-1',
  );
  const secondPane = selectChartTradeReceiptSnapshotForPane(
    snapshot,
    'chart-window-2',
  );

  assert.deepEqual(firstPane.map((event) => event.symbol), ['XAUUSD']);
  assert.deepEqual(secondPane.map((event) => event.symbol), ['BTCUSD']);
  assert.equal(firstPane[0], xauusd);
  assert.equal(secondPane[0], btcusd);
});

test('pane ownership, rather than symbol identity, separates same-symbol receipts', () => {
  const firstPaneXauusd = pendingEvent(11, 'chart-window-1', 'XAUUSD');
  const secondPaneXauusd = pendingEvent(12, 'chart-window-2', 'XAUUSD');
  const snapshot = applyEvents([firstPaneXauusd, secondPaneXauusd]);

  assert.deepEqual(
    selectChartTradeReceiptSnapshotForPane(snapshot, 'chart-window-1').map(
      (event) => event.queueId,
    ),
    [11],
  );
  assert.deepEqual(
    selectChartTradeReceiptSnapshotForPane(snapshot, 'chart-window-2').map(
      (event) => event.queueId,
    ),
    [12],
  );
});

test('a terminal event cannot migrate a receipt away from its pending-event owner', () => {
  const pending = pendingEvent(21, 'chart-window-1', 'XAUUSD');
  const pendingSnapshot = reduceChartTradeReceiptStack([], pending);
  const confirmedSnapshot = reduceChartTradeReceiptStack(pendingSnapshot, {
    ...pending,
    status: 'confirmed',
    chartWindowPaneId: 'chart-window-2',
    feedback: {
      visible: true,
      type: 'success',
      side: 'buy',
      symbol: 'XAUUSD',
      ticket: 'xauusd-ticket-21',
      volume: 0.03,
      executionConfirmed: true,
    },
  });

  assert.equal(confirmedSnapshot[0]?.status, 'confirmed');
  assert.equal(confirmedSnapshot[0]?.feedback?.ticket, 'xauusd-ticket-21');
  assert.equal(confirmedSnapshot[0]?.chartWindowPaneId, 'chart-window-1');
  assert.deepEqual(
    selectChartTradeReceiptSnapshotForPane(
      confirmedSnapshot,
      'chart-window-1',
    ).map((event) => event.queueId),
    [21],
  );
  assert.deepEqual(
    selectChartTradeReceiptSnapshotForPane(
      confirmedSnapshot,
      'chart-window-2',
    ),
    [],
  );
});
