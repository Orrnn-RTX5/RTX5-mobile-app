import assert from 'node:assert/strict';
import test from 'node:test';

import { isTerminalPositionUpdate } from './positionsState.helpers.ts';

test('contract v3 position_closed events are terminal', () => {
  assert.equal(isTerminalPositionUpdate({ ticket: 2002, type: 'position_closed' }), true);
  assert.equal(isTerminalPositionUpdate({ ticket: 2002, event: 'position.closed' }), true);
});

test('contract v3 close_reason marks a row terminal even without an event name', () => {
  for (const closeReason of ['sl', 'tp', 'stop_out', 'netting_close', 'netting_reverse', 'SL']) {
    assert.equal(
      isTerminalPositionUpdate({
        ticket: 2002,
        close_reason: closeReason,
        price_close: 1.13,
        profit: -7.45,
        swap: 0,
        deal_ticket: '5005',
        closed_at: 1790241600,
      }),
      true,
      closeReason,
    );
  }
});

test('non-terminal contract v3 position events stay live', () => {
  for (const type of [
    'position_opened',
    'position_increased',
    'position_decreased',
    'position_reversed',
    'position_partial_close',
    'position_modified',
    'position_update',
    'swap_applied',
    'margin_call',
  ]) {
    assert.equal(isTerminalPositionUpdate({ ticket: 2002, type }), false, type);
  }
  assert.equal(isTerminalPositionUpdate({ ticket: 2002, close_reason: 'manual' }), false);
  assert.equal(isTerminalPositionUpdate({ ticket: 2002, close_reason: null }), false);
});

test('legacy SL/TP trigger names remain terminal', () => {
  assert.equal(isTerminalPositionUpdate({ ticket: 1, event: 'sl.triggered' }), true);
  assert.equal(isTerminalPositionUpdate({ ticket: 1, type: 'tp_triggered' }), true);
});
