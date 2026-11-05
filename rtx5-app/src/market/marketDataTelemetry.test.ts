import assert from 'node:assert/strict';
import test from 'node:test';

import {
  fingerprintMarketDataHost,
  getMarketDataOperationalMetricsSnapshot,
  getMarketDataTelemetrySnapshot,
  recordMarketDataEvent,
  resetMarketDataTelemetryForTests,
  setLiveQuoteSocketConnected,
} from './marketDataTelemetry';

test('market-data telemetry is bounded and centrally redacts every event', () => {
  resetMarketDataTelemetryForTests();
  recordMarketDataEvent('socket_close', {
    url: 'wss://feed.example/ws?token=secret-token',
    Authorization: 'Bearer secret-access',
  });
  const first = getMarketDataTelemetrySnapshot()[0];
  const serialized = JSON.stringify(first);
  assert.doesNotMatch(serialized, /secret-token|secret-access/);
  assert.match(serialized, /\[redacted\]/);

  for (let index = 0; index < 250; index += 1) {
    recordMarketDataEvent('payload_dropped', { index });
  }
  assert.equal(getMarketDataTelemetrySnapshot().length, 200);
});

test('host fingerprints are stable and never expose the hostname', () => {
  const first = fingerprintMarketDataHost('wss://feed.example.test/ws/feed?token=secret');
  const second = fingerprintMarketDataHost('https://feed.example.test/status');
  assert.equal(first, second);
  assert.doesNotMatch(first, /feed|example|secret/);
  assert.match(first, /^[a-f0-9]{8}$/);
});

test('operational metrics track socket count and reconnect completion', () => {
  resetMarketDataTelemetryForTests();
  recordMarketDataEvent('reconnect_scheduled', { delayMs: 1 });
  assert.equal(getMarketDataOperationalMetricsSnapshot().reconnectInProgress, true);
  recordMarketDataEvent('socket_open', { transport: 'quotes_ws' });
  const connected = getMarketDataOperationalMetricsSnapshot();
  assert.equal(connected.liveQuoteSocketCount, 1);
  assert.equal(connected.reconnectInProgress, false);
  assert.equal(connected.completedReconnectCount, 1);
  assert.equal(typeof connected.lastReconnectDurationMs, 'number');
  recordMarketDataEvent('socket_close', { transport: 'quotes_ws' });
  assert.equal(getMarketDataOperationalMetricsSnapshot().liveQuoteSocketCount, 0);
  setLiveQuoteSocketConnected(true);
  setLiveQuoteSocketConnected(false);
  assert.equal(getMarketDataOperationalMetricsSnapshot().liveQuoteSocketCount, 0);
});
