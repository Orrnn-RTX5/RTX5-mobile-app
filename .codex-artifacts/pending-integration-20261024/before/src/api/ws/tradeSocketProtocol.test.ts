import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildTradeSocketSubscriptionMessages,
  classifyPositionEvent,
  isAccountChangingPositionEvent,
  isHistoryChangingPositionEvent,
  isMetricsEventName,
  parseTradeSocketFrame,
  readPositionCloseReason,
  shouldCycleTradeSocketForSessionEvent,
} from './tradeSocketProtocol.ts';
import { extractLiveAccountMetrics } from './accountSocket.helpers.ts';

test('trade socket subscribes to positions and metrics only, one channel per message', () => {
  assert.deepEqual(buildTradeSocketSubscriptionMessages(200074), [
    { action: 'subscribe', channel: 'positions.200074' },
    { action: 'subscribe', channel: 'metrics.200074' },
  ]);
  assert.equal(
    buildTradeSocketSubscriptionMessages('200074').some((message) => message.channel.startsWith('deals.')),
    false,
  );
  assert.deepEqual(buildTradeSocketSubscriptionMessages('  '), []);
});

test('control frames: pong, subscribed ack, and channel error', () => {
  assert.deepEqual(
    parseTradeSocketFrame({ request_id: null, action: 'pong', success: true, data: { time: 1790241500123 } }),
    { kind: 'pong' },
  );
  assert.deepEqual(
    parseTradeSocketFrame({ type: 'subscribed', channel: 'positions.200074' }),
    { kind: 'ack', channel: 'positions.200074' },
  );
  assert.deepEqual(
    parseTradeSocketFrame({ type: 'error', channel: 'deals.200074', message: 'unknown channel' }),
    { kind: 'error', channel: 'deals.200074', message: 'unknown channel' },
  );
  assert.deepEqual(parseTradeSocketFrame(null), { kind: 'unknown' });
  assert.deepEqual(parseTradeSocketFrame([1, 2]), { kind: 'unknown' });
});

test('nested position envelope reads the event from data.type and the row from data.data', () => {
  const frame = parseTradeSocketFrame({
    channel: 'positions.200074',
    data: {
      event_id: 'evt-1',
      client_order_id: 'order-6f1c2c1e',
      type: 'position_opened',
      data: {
        ticket: 2002,
        account_login: 200074,
        broker_id: 'trivanta-markets',
        symbol: 'EURUSD',
        side: 'buy',
        volume: 0.01,
        price_open: 1.13745,
        price_sl: 1.13,
        price_tp: null,
        state_version: '1',
      },
    },
  });

  assert.equal(frame.kind, 'event');
  if (frame.kind !== 'event') return;
  assert.equal(frame.channel, 'positions.200074');
  assert.equal(frame.eventName, 'position.opened');
  assert.equal(frame.nested, true);
  assert.equal(frame.eventId, 'evt-1');
  assert.equal(frame.clientOrderId, 'order-6f1c2c1e');
  assert.equal((frame.payload as Record<string, unknown>).ticket, 2002);
  assert.equal(classifyPositionEvent(frame.eventName), 'upsert');
});

test('position_update carries an array payload and classifies as a batch', () => {
  const frame = parseTradeSocketFrame({
    channel: 'positions.200074',
    data: {
      type: 'position_update',
      data: [
        { ticket: 2002, price_current: 1.1376, profit: 0.15 },
        { ticket: 2003, price_current: 83385.56, profit: -1.2 },
      ],
    },
  });
  assert.equal(frame.kind, 'event');
  if (frame.kind !== 'event') return;
  assert.equal(frame.eventName, 'position.update');
  assert.ok(Array.isArray(frame.payload));
  assert.equal((frame.payload as unknown[]).length, 2);
  assert.equal(classifyPositionEvent(frame.eventName), 'batch');
});

test('every contract position event maps onto the existing hint/refresh logic', () => {
  assert.equal(classifyPositionEvent('position_opened'), 'upsert');
  assert.equal(classifyPositionEvent('position_increased'), 'upsert');
  assert.equal(classifyPositionEvent('position_decreased'), 'upsert');
  assert.equal(classifyPositionEvent('position_reversed'), 'upsert');
  assert.equal(classifyPositionEvent('position_modified'), 'upsert');
  assert.equal(classifyPositionEvent('swap_applied'), 'upsert');
  assert.equal(classifyPositionEvent('position_partial_close'), 'partial_close');
  assert.equal(classifyPositionEvent('position_closed'), 'closed');
  assert.equal(classifyPositionEvent('position_update'), 'batch');
  assert.equal(classifyPositionEvent('margin_call'), 'account');
  assert.equal(classifyPositionEvent('something_else'), 'unknown');

  assert.equal(isHistoryChangingPositionEvent('position_closed'), true);
  assert.equal(isHistoryChangingPositionEvent('position_partial_close'), true);
  assert.equal(isHistoryChangingPositionEvent('position_modified'), false);
  assert.equal(isHistoryChangingPositionEvent('position_update'), false);
  assert.equal(isAccountChangingPositionEvent('margin_call'), true);
  assert.equal(isAccountChangingPositionEvent('swap_applied'), true);
  assert.equal(isAccountChangingPositionEvent('position_update'), false);
});

test('SL/TP hits are position_closed events with close_reason', () => {
  const frame = parseTradeSocketFrame({
    channel: 'positions.200074',
    data: {
      event_id: 'evt-9',
      type: 'position_closed',
      data: {
        ticket: 2002,
        account_login: 200074,
        symbol: 'EURUSD',
        close_reason: 'sl',
        price_close: 1.13,
        profit: -7.45,
        swap: 0,
        deal_ticket: '5005',
        closed_at: 1790241600,
      },
    },
  });
  assert.equal(frame.kind, 'event');
  if (frame.kind !== 'event') return;
  assert.equal(classifyPositionEvent(frame.eventName), 'closed');
  assert.equal(readPositionCloseReason(frame.payload), 'sl');
  assert.equal(readPositionCloseReason({ close_reason: 'TP' }), 'tp');
  assert.equal(readPositionCloseReason({ close_reason: 'stop_out' }), 'stop_out');
  assert.equal(readPositionCloseReason({ close_reason: 'netting_close' }), 'netting_close');
  assert.equal(readPositionCloseReason({ close_reason: 'netting_reverse' }), 'netting_reverse');
  assert.equal(readPositionCloseReason({ close_reason: 'manual' }), null);
  assert.equal(readPositionCloseReason({}), null);
});

test('metrics_update frames expose the new keys through the shared normalizer', () => {
  const frame = parseTradeSocketFrame({
    channel: 'metrics.200074',
    data: {
      type: 'metrics_update',
      publication_token: 'pub-1',
      data: {
        login: 200074,
        balance: 10000,
        credit: 0,
        equity: 10000.15,
        used_margin: 11.37,
        free_margin: 9988.78,
        margin_level: 87952.5,
        floating_pnl: 0.15,
        total_swap: 0,
      },
    },
  });
  assert.equal(frame.kind, 'event');
  if (frame.kind !== 'event') return;
  assert.equal(isMetricsEventName(frame.eventName), true);
  assert.deepEqual(extractLiveAccountMetrics(frame.payload), {
    login: 200074,
    balance: 10000,
    equity: 10000.15,
    margin: 11.37,
    margin_free: 9988.78,
    margin_level: 87952.5,
    floating: 0.15,
  });
});

test('metrics frames that omit failed calculations do not invent zero values', () => {
  const frame = parseTradeSocketFrame({
    channel: 'metrics.200074',
    data: { type: 'metrics_update', data: { login: 200074, balance: 10000, credit: 0 } },
  });
  assert.equal(frame.kind, 'event');
  if (frame.kind !== 'event') return;
  assert.deepEqual(extractLiveAccountMetrics(frame.payload), { login: 200074, balance: 10000 });
});

test('legacy flat frames remain tolerated', () => {
  const flatArray = parseTradeSocketFrame({
    channel: 'positions.200074',
    event: 'position.update',
    data: [{ ticket: 2002 }],
  });
  assert.equal(flatArray.kind, 'event');
  if (flatArray.kind === 'event') {
    assert.equal(flatArray.nested, false);
    assert.equal(flatArray.eventName, 'position.update');
    assert.ok(Array.isArray(flatArray.payload));
  }

  const flatRow = parseTradeSocketFrame({ channel: 'positions.200074', data: { ticket: 2002, profit: 1 } });
  assert.equal(flatRow.kind, 'event');
  if (flatRow.kind === 'event') {
    assert.equal(flatRow.nested, false);
    assert.equal(flatRow.eventName, '');
    assert.equal((flatRow.payload as Record<string, unknown>).ticket, 2002);
  }

  const legacyProtection = parseTradeSocketFrame({
    channel: 'positions.200074',
    data: { type: 'sl_triggered', data: { ticket: 900123 } },
  });
  assert.equal(legacyProtection.kind, 'event');
  if (legacyProtection.kind === 'event') {
    assert.equal(legacyProtection.eventName, 'sl.triggered');
  }
});

test('trade socket cycles on every credential rotation while it has demand', () => {
  assert.equal(
    shouldCycleTradeSocketForSessionEvent({ type: 'credentials_updated', activeSession: {} }, true),
    true,
  );
  assert.equal(
    shouldCycleTradeSocketForSessionEvent({ type: 'credentials_updated', activeSession: {} }, false),
    false,
  );
  assert.equal(
    shouldCycleTradeSocketForSessionEvent({ type: 'credentials_updated', activeSession: null }, true),
    false,
  );
  assert.equal(
    shouldCycleTradeSocketForSessionEvent({ type: 'activated', activeSession: {} }, true),
    false,
  );
});

test('a token refresh commit emits credentials_updated, which cycles the trade socket', async () => {
  const session = await import('../../state/activeBrokerSession.ts');
  session.__resetActiveBrokerSessionForTests();
  const sessionInput = {
    brokerId: 'trivanta-markets',
    accountLogin: '200074',
    apiBase: 'https://trivanta.orrnn.com/api/v2',
    feedWsBase: 'wss://trivanta.orrnn.com/ws/feed',
    tradeWsBase: 'wss://trivanta.orrnn.com/ws/v2',
    feedStatusUrl: 'https://trivanta.orrnn.com/ws/feed/status',
    servicesDomain: 'trivanta.orrnn.com',
    investor: false,
    configVersion: 'cfg-1',
  } as unknown as Parameters<typeof session.activateBrokerSession>[1];
  const credentials = (accessToken: string) => ({
    accessToken,
    refreshToken: `rtx5_rt_${accessToken}`,
    expiresAt: '2099-01-01T00:00:00.000Z',
  }) as Parameters<typeof session.activateBrokerSession>[2];

  const capture = session.activateBrokerSession(
    session.beginActiveBrokerSessionTransition(),
    sessionInput,
    credentials('access-1'),
  );
  const identity = session.getActiveBrokerSessionIdentity(capture.session);
  const cycles: string[] = [];
  session.subscribeActiveBrokerSession((event) => {
    if (shouldCycleTradeSocketForSessionEvent(event, true)) {
      cycles.push(session.captureActiveBrokerSession()?.credentials.accessToken ?? '');
    }
  });

  assert.equal(session.updateActiveBrokerSessionCredentials(identity, credentials('access-2')), true);
  assert.equal(session.updateActiveBrokerSessionCredentials(identity, credentials('access-3')), true);
  assert.deepEqual(cycles, ['access-2', 'access-3']);
  session.__resetActiveBrokerSessionForTests();
});
