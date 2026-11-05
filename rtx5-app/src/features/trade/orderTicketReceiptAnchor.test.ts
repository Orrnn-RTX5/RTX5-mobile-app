import assert from 'node:assert/strict';
import test from 'node:test';
import { createOrderTicketReceiptAnchor } from './orderTicketReceiptAnchor';

test('the popup stack ends immediately above the measured Sell/Buy row', () => {
  const anchor = createOrderTicketReceiptAnchor();
  assert.equal(anchor.getSnapshot(), null, 'never flash at a guessed screen offset');
  anchor.update({ rootHeight: 800, viewportTop: 60, viewportHeight: 700, actionsTop: 640 });
  assert.deepEqual(anchor.getSnapshot(), { top: 68, bottom: 108 });
  assert.equal(800 - anchor.getSnapshot()!.bottom, 60 + 640 - 8);
});

test('popup placement follows scrolling, changed button layout and screen size', () => {
  const anchor = createOrderTicketReceiptAnchor();
  anchor.update({ rootHeight: 800, viewportTop: 60, viewportHeight: 700, actionsTop: 640 });
  anchor.update({ scrollOffset: 100 });
  assert.deepEqual(anchor.getSnapshot(), { top: 68, bottom: 208 });
  anchor.update({ actionsTop: 680 });
  assert.deepEqual(anchor.getSnapshot(), { top: 68, bottom: 168 });
  anchor.update({ rootHeight: 480, viewportHeight: 400, scrollOffset: 400 });
  assert.deepEqual(anchor.getSnapshot(), { top: 68, bottom: 148 });
});

test('offscreen buttons hide the stack until they return without moving the ticket', () => {
  const anchor = createOrderTicketReceiptAnchor();
  let notifications = 0;
  const unsubscribe = anchor.subscribe(() => { notifications++; });
  anchor.update({ rootHeight: 800, viewportTop: 60, viewportHeight: 700, actionsTop: 900 });
  assert.equal(anchor.getSnapshot(), null);
  anchor.update({ scrollOffset: 300 });
  assert.deepEqual(anchor.getSnapshot(), { top: 68, bottom: 148 });
  const snapshot = anchor.getSnapshot();
  anchor.update({ scrollOffset: 300 });
  assert.equal(anchor.getSnapshot(), snapshot);
  assert.equal(notifications, 1, 'identical geometry must not rerender the overlay');
  anchor.update({ scrollOffset: 900 });
  assert.equal(anchor.getSnapshot(), null, 'receipts must not cover the header');
  unsubscribe(); anchor.update({ scrollOffset: 300 });
  assert.equal(notifications, 2);
});
