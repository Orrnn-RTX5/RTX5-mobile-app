import assert from 'node:assert/strict';
import test from 'node:test';
import { createChartTradeReceiptStackController } from '../chart/components/chartTradeReceiptStackController';
import { createMarketTradeReceiptCallbacks } from './marketTradeReceiptCallbacks';

test('ten concurrent mixed trades retain ten ordered popups when responses arrive out of order', () => {
  const controller = createChartTradeReceiptStackController({ terminalDismissMs: 0 });
  const callbacks = Array.from({ length: 10 }, (_, i) => createMarketTradeReceiptCallbacks(controller, {
    queueId: i + 1, side: i % 2 ? 'buy' : 'sell', symbol: i % 2 ? 'BTCUSD' : 'EURUSD',
    volume: 0.01 * (i + 1), status: 'pending',
  }, () => true));
  assert.equal(controller.getSnapshot().length, 10);
  assert.ok(controller.getSnapshot().every(row => row.status === 'pending'));
  for (const i of [9, 3, 1, 7, 0, 2, 4, 8, 6, 5]) {
    callbacks[i].onSuccess({ status: 'filled', position_ticket: `900719925474099${i}`, price: 1.1234567 + i });
    callbacks[i].onSettled();
    callbacks[i].onSuccess({ status: 'filled', position_ticket: 'wrong-duplicate', price: 999 });
  }
  controller.getSnapshot().forEach((row, i) => {
    assert.equal(row.queueId, i + 1);
    assert.equal(row.status, 'confirmed');
    assert.equal(row.feedback?.ticket, `900719925474099${i}`);
    assert.equal(row.feedback?.side, i % 2 ? 'buy' : 'sell');
    assert.equal(row.feedback?.price, 1.1234567 + i);
  });
});

test('account switch or cleared screen cannot resurrect old trade receipts', () => {
  for (const clear of [true, false]) {
    const controller = createChartTradeReceiptStackController({ terminalDismissMs: 0 });
    let current = true;
    const callbacks = createMarketTradeReceiptCallbacks(controller,
      { queueId: 1, side: 'buy', symbol: 'BTCUSD', volume: 0.01, status: 'pending' }, () => current);
    if (clear) controller.clear();
    else current = false;
    callbacks.onSuccess({ position_ticket: '123', price: 81621.85 });
    callbacks.onSettled();
    assert.equal(controller.getSnapshot().length, 0);
  }
});

test('missing execution evidence and transport uncertainty never show a completed trade', () => {
  const controller = createChartTradeReceiptStackController({ terminalDismissMs: 0 });
  const accepted = createMarketTradeReceiptCallbacks(controller,
    { queueId: 1, side: 'buy', symbol: 'BTCUSD', volume: 0.01, status: 'pending' }, () => true);
  accepted.onSuccess({ status: 'accepted' });
  const uncertain = createMarketTradeReceiptCallbacks(controller,
    { queueId: 2, side: 'sell', symbol: 'BTCUSD', volume: 0.01, status: 'pending' }, () => true);
  uncertain.onError(new Error('Network request failed'));
  assert.ok(controller.getSnapshot().every(row => row.status === 'unconfirmed'));
});
