import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BROKER_DIRECTORY_HEALTH_REFRESH_INTERVAL_MS,
  BROKER_DIRECTORY_HEALTH_RESULT_MAX_AGE_MS,
  classifyBrokerDirectoryHealth,
} from './brokerDirectoryHealth';

// Live Orrnn reading: upstream_disconnected while ticks flow (contract v3 5.2).
const orrnnLive = {
  broker_id: 'Orrnn',
  status: 'upstream_disconnected',
  upstream_connected: false,
  symbols_fresh: 57,
  providers: [{ id: 'rtx_market_data', connected: true }],
};

test('directory badge maps the v3 verdict: healthy, degraded, down', () => {
  assert.deepEqual(classifyBrokerDirectoryHealth(orrnnLive, 1_000), {
    state: 'healthy',
    label: 'Market data available',
  });
  assert.deepEqual(classifyBrokerDirectoryHealth({ ...orrnnLive, symbols_fresh: 0 }, 1_000), {
    state: 'delayed',
    label: 'Prices delayed',
  });
  assert.deepEqual(classifyBrokerDirectoryHealth({ symbols_fresh: 0, providers: [] }, 1_000), {
    state: 'provider_down',
    label: 'Provider unavailable',
  });
});

test('directory badge ignores upstream_connected, status, auth_accepted and market_available', () => {
  for (const ignored of [
    { upstream_connected: true },
    { upstream_connected: false },
    { status: 'down' },
    { auth_accepted: false },
    { market_available: false },
  ]) {
    assert.equal(classifyBrokerDirectoryHealth({ ...orrnnLive, ...ignored }, 1_000).state, 'healthy');
  }
});

test('directory badge is fail closed for unusable payloads', () => {
  assert.equal(classifyBrokerDirectoryHealth({}, 1_000).state, 'unavailable');
  assert.equal(classifyBrokerDirectoryHealth({ status: 'healthy', upstream_connected: true }, 1_000).state, 'unavailable');
  assert.equal(classifyBrokerDirectoryHealth(null, 1_000).state, 'unavailable');
  assert.equal(classifyBrokerDirectoryHealth(orrnnLive, 0).state, 'unavailable');
});

test('directory badge observations refresh and expire on a bounded cadence', () => {
  assert.equal(BROKER_DIRECTORY_HEALTH_REFRESH_INTERVAL_MS, 30_000);
  assert.equal(BROKER_DIRECTORY_HEALTH_RESULT_MAX_AGE_MS, 45_000);
  assert.ok(
    BROKER_DIRECTORY_HEALTH_RESULT_MAX_AGE_MS >
      BROKER_DIRECTORY_HEALTH_REFRESH_INTERVAL_MS,
  );
  assert.ok(
    BROKER_DIRECTORY_HEALTH_RESULT_MAX_AGE_MS <=
      BROKER_DIRECTORY_HEALTH_REFRESH_INTERVAL_MS * 2,
  );
});
