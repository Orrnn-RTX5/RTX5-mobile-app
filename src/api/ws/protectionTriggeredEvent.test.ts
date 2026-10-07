import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeProtectionTriggeredEvent } from './protectionTriggeredEvent.ts';

test('SL terminal envelope exposes the exact ticket, actual close, and backend reason', () => {
  const normalized = normalizeProtectionTriggeredEvent({
    type: 'sl_triggered',
    data: {
      ticket: 900123,
      symbol: 'EURUSD',
      side: 'buy',
      volume: '0.10',
      price_open: '1.09000',
      price_close: '1.08250',
      profit: '-75.00',
      reason: 'stop_loss',
      time_close: 1_784_800_001,
    },
  });

  assert.ok(normalized);
  assert.equal(normalized.eventName, 'sl.triggered');
  assert.equal(normalized.ticket, 900123);
  assert.equal(normalized.row.ticket, 900123);
  assert.equal(normalized.row.position_ticket, 900123);
  assert.equal(normalized.row.status, 'sl.triggered');
  assert.equal(normalized.journalPayload.price_close, '1.08250');
  assert.equal(normalized.journalPayload.reason, 'stop_loss');
  assert.equal(
    normalized.eventFingerprint,
    'sl.triggered:900123:1784800001',
  );
});

test('TP terminal envelope accepts an inherited normalized event name', () => {
  const normalized = normalizeProtectionTriggeredEvent(
    {
      data: {
        ticket: 900124,
        close_price: 1.095,
        reason: 'take_profit',
      },
    },
    'tp.triggered',
  );

  assert.ok(normalized);
  assert.equal(normalized.eventName, 'tp.triggered');
  assert.equal(normalized.ticket, 900124);
  assert.equal(normalized.journalPayload.price_close, 1.095);
});

test('unknown, aliased, or non-safe-integer tickets remain harmless', () => {
  for (const value of [
    null,
    [],
    { type: 'position_updated', data: { ticket: 1 } },
    { type: 'sl_triggered', data: {} },
    { type: 'sl_triggered', data: { position_ticket: 900124 } },
    { type: 'sl_triggered', data: { order_ticket: 900124 } },
    { type: 'sl_triggered', ticket: 900124, data: { symbol: 'EURUSD' } },
    { type: 'tp_triggered', data: { ticket: '' } },
    { type: 'tp_triggered', data: { ticket: {} } },
    { type: 'tp_triggered', data: { ticket: '900124' } },
    { type: 'tp_triggered', data: { ticket: 0 } },
    { type: 'tp_triggered', data: { ticket: -1 } },
    { type: 'tp_triggered', data: { ticket: 1.5 } },
    { type: 'tp_triggered', data: { ticket: Number.MAX_SAFE_INTEGER + 1 } },
  ]) {
    assert.equal(normalizeProtectionTriggeredEvent(value), null);
  }
});

test('contract v3: position_closed with close_reason sl/tp is an SL/TP hit', () => {
  const envelope = {
    event_id: 'evt-77',
    client_order_id: null,
    type: 'position_closed',
    data: {
      ticket: 2002,
      account_login: 200074,
      broker_id: 'trivanta-markets',
      symbol: 'EURUSD',
      close_reason: 'sl',
      price_close: 1.13,
      profit: -7.45,
      swap: 0,
      deal_ticket: '5005',
      closed_at: 1790241600,
    },
  };

  const sl = normalizeProtectionTriggeredEvent(envelope, 'position.closed');
  assert.ok(sl);
  assert.equal(sl.eventName, 'sl.triggered');
  assert.equal(sl.ticket, 2002);
  assert.equal(sl.journalPayload.price_close, 1.13);
  assert.equal(sl.journalPayload.reason, 'sl');
  assert.equal(sl.journalPayload.close_reason, 'sl');
  assert.equal(sl.journalPayload.account_login, 200074);
  assert.equal(sl.eventFingerprint, 'sl.triggered:2002:evt-77');

  // Without an inherited name the envelope type is read directly.
  const tp = normalizeProtectionTriggeredEvent({
    ...envelope,
    event_id: undefined,
    data: { ...envelope.data, close_reason: 'tp' },
  });
  assert.ok(tp);
  assert.equal(tp.eventName, 'tp.triggered');
  assert.equal(tp.eventFingerprint, 'tp.triggered:2002:5005');
});

test('contract v3: other close reasons and plain closes are not SL/TP hits', () => {
  for (const closeReason of ['stop_out', 'netting_close', 'netting_reverse', 'manual', undefined]) {
    assert.equal(
      normalizeProtectionTriggeredEvent(
        { type: 'position_closed', data: { ticket: 2002, close_reason: closeReason } },
        'position.closed',
      ),
      null,
    );
  }
  assert.equal(
    normalizeProtectionTriggeredEvent(
      { type: 'position_modified', data: { ticket: 2002, close_reason: 'sl' } },
      'position.modified',
    ),
    null,
  );
});
