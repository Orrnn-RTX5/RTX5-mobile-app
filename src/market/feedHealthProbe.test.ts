import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  FEED_STATUS_PROBE_TIMEOUT_MS,
  normalizeFeedStatusVerdict,
} from './feedHealthProbe';
import {
  feedHealthBlocksSocketConnection,
  initialFeedHealthState,
  reduceFeedHealth,
} from './feedHealthState';

// Live readings from Backend Contract v3, section 5.2 (trimmed).
const TRIVANTA_STATUS = {
  broker_id: 'trivanta-markets',
  status: 'healthy',
  upstream_connected: true,
  upstream_mode: 'fix',
  symbols_total: 61,
  symbols_fresh: 59,
  symbols_stale: 2,
  providers: [{ id: 'rtx_market_data', connected: true }],
};
const ORRNN_STATUS = {
  broker_id: 'Orrnn',
  status: 'upstream_disconnected',
  upstream_connected: false,
  upstream_mode: 'none',
  symbols_total: 62,
  symbols_fresh: 57,
  symbols_stale: 5,
  providers: [{ id: 'rtx_market_data', connected: true }],
};

test('healthy = symbols_fresh > 0 and a connected provider (Trivanta live reading)', () => {
  assert.deepEqual(normalizeFeedStatusVerdict(TRIVANTA_STATUS, 1_000), {
    observedAt: 1_000,
    verdict: 'healthy',
    symbolsFresh: 59,
    providerConnected: true,
  });
});

test('Orrnn upstream_disconnected / upstream_connected:false is ignored while symbols are fresh', () => {
  const verdict = normalizeFeedStatusVerdict(ORRNN_STATUS, 1_000);
  assert.equal(verdict?.verdict, 'healthy');
  assert.equal(verdict?.symbolsFresh, 57);
});

test('a missing auth_accepted / market_available never degrades the verdict', () => {
  // Neither key exists in v3. Present or absent, they do not change the rule.
  assert.equal(normalizeFeedStatusVerdict({ ...TRIVANTA_STATUS, auth_accepted: false }, 1)?.verdict, 'healthy');
  assert.equal(normalizeFeedStatusVerdict({ ...TRIVANTA_STATUS, market_available: false }, 1)?.verdict, 'healthy');
});

test('degraded = symbols_fresh == 0 while a provider is connected', () => {
  assert.equal(
    normalizeFeedStatusVerdict({ ...TRIVANTA_STATUS, symbols_fresh: 0 }, 1)?.verdict,
    'degraded',
  );
});

test('down = no provider connected and symbols_fresh == 0', () => {
  const down = normalizeFeedStatusVerdict({
    ...TRIVANTA_STATUS,
    symbols_fresh: 0,
    providers: [{ id: 'rtx_market_data', connected: false }],
  }, 1);
  assert.equal(down?.verdict, 'down');
  assert.equal(down?.providerConnected, false);
  assert.equal(
    normalizeFeedStatusVerdict({ symbols_fresh: 0, providers: [] }, 1)?.verdict,
    'down',
  );
});

test('fresh symbols without a connected provider are degraded, not down', () => {
  assert.equal(
    normalizeFeedStatusVerdict({ symbols_fresh: 3, providers: [{ id: 'x', connected: false }] }, 1)?.verdict,
    'degraded',
  );
});

test('payloads without symbols_fresh or providers are not a verdict', () => {
  assert.equal(normalizeFeedStatusVerdict({ status: 'healthy' }, 1), null);
  assert.equal(normalizeFeedStatusVerdict(null, 1), null);
  assert.equal(normalizeFeedStatusVerdict(TRIVANTA_STATUS, 0), null);
});

test('a "down" verdict is diagnostic only and never blocks the quote socket', () => {
  const identity = { brokerId: 'Orrnn', accountLogin: '200074', sessionEpoch: 1 };
  const bound = reduceFeedHealth(initialFeedHealthState, {
    type: 'BIND_SESSION',
    identity,
    transportConfigured: true,
    credentialApproved: true,
  });
  const down = normalizeFeedStatusVerdict({ symbols_fresh: 0, providers: [] }, 5_000)!;
  const afterStatus = reduceFeedHealth(bound, { type: 'SERVER_STATUS', identity, health: down });
  assert.equal(afterStatus.status, 'provider_down');
  assert.equal(feedHealthBlocksSocketConnection(afterStatus, identity), false);
});

test('probe is on demand, tokenless, and bounded by a 10 s timeout', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/market/feedHealthProbe.ts'), 'utf8');
  assert.equal(FEED_STATUS_PROBE_TIMEOUT_MS, 10_000);
  assert.match(source, /timeoutMs: FEED_STATUS_PROBE_TIMEOUT_MS/);
  assert.match(source, /const statusUrl = cleanString\(capture\.session\.feedStatusUrl\)/);
  assert.doesNotMatch(source, /searchParams\.set|feedToken|feedAuth|accessToken/);
  assert.doesNotMatch(source, /setInterval\s*\(/);
});
