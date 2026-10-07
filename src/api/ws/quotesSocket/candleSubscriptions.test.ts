import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildFeedCandleSubscriptionMessages,
  createCandleFeedSubscription,
} from './candleSubscriptions';
import {
  toBridgeCandleTf,
  toRestCandleTf,
} from '../../../domain/candles/core/candles';

test('toBridgeCandleTf maps app timeframes to /ws/feed candle tf keys', () => {
  assert.equal(toBridgeCandleTf('M1'), '1m');
  assert.equal(toBridgeCandleTf('M5'), '5m');
  assert.equal(toBridgeCandleTf('M15'), '15m');
  assert.equal(toBridgeCandleTf('M30'), '30m');
  assert.equal(toBridgeCandleTf('H1'), '1h');
  assert.equal(toBridgeCandleTf('H4'), '4h');
  assert.equal(toBridgeCandleTf('D1'), '1d');
  // /ws/feed accepts only 1m/M1, 5m, 15m, 30m, 1h, 4h, 1d.
  assert.equal(toBridgeCandleTf('W1'), null);
  assert.equal(toBridgeCandleTf('MN'), null);
});

test('REST candle requests always use M1-style timeframes (1m returns 400 INVALID_TIMEFRAME)', () => {
  assert.equal(toRestCandleTf('1m'), 'M1');
  assert.equal(toRestCandleTf('M1'), 'M1');
  assert.equal(toRestCandleTf('H1'), 'H1');
  assert.equal(toRestCandleTf('D1'), 'D1');
  assert.equal(toRestCandleTf('MN1'), 'MN');
});

test('candle subscriptions use /ws/feed subscribe_candles, one message per symbol/tf', () => {
  const eurUsd = createCandleFeedSubscription('EURUSD', 'M1');
  const xauUsd = createCandleFeedSubscription('XAUUSD', '1m');
  const btcUsd = createCandleFeedSubscription('BTCUSD', 'D1');

  assert.ok(eurUsd);
  assert.ok(xauUsd);
  assert.ok(btcUsd);
  assert.deepEqual(
    buildFeedCandleSubscriptionMessages('subscribe', [eurUsd, xauUsd, btcUsd, eurUsd]),
    [
      { type: 'subscribe_candles', symbol: 'EURUSD', tf: '1m' },
      { type: 'subscribe_candles', symbol: 'XAUUSD', tf: '1m' },
      { type: 'subscribe_candles', symbol: 'BTCUSD', tf: '1d' },
    ],
  );
  assert.deepEqual(
    buildFeedCandleSubscriptionMessages('unsubscribe', [eurUsd]),
    [{ type: 'unsubscribe_candles', symbol: 'EURUSD', tf: '1m' }],
  );
});

test('timeframes the feed cannot stream produce no candle subscription', () => {
  assert.equal(createCandleFeedSubscription('EURUSD', 'W1'), null);
  assert.equal(createCandleFeedSubscription('EURUSD', 'MN'), null);
});
