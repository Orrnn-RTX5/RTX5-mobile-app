import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildApiUrl,
  buildBrokerApiBaseUrl,
  buildBrokerHealthUrl,
  buildBrokerWsUrl,
  buildVersionedBrokerApiUrl,
  containsBlockedTestNetBrokerIp,
  deriveBrokerTradeWsBase,
  ensureBrokerRestApiBase,
  isBrokerServerUrlForApiBase,
  normalizeBrokerHttpsUrl,
  normalizeBrokerServerUrl,
  normalizeBrokerWssUrl,
  normalizeConfiguredWsUrl,
  revalidateBrokerSessionEndpointSet,
  resolveBrokerEndpointSet,
  resolveBrokerServiceBaseUrl,
  toBrokerServiceRoot,
} from './brokerRouting';

const richRecord = () => ({
  broker_id: 'alpha-broker',
  enabled: true,
  active: true,
  license_active: true,
  config_version: '2026-07-17.1',
  services_domain: 'services.alpha-broker.com',
  server_url: 'https://services.alpha-broker.com/api/v2',
  market_api_url: 'https://services.alpha-broker.com/api/v2',
  feed_wss_url: 'wss://services.alpha-broker.com/ws/feed',
  feed_status_https_url: 'https://services.alpha-broker.com/ws/feed/status',
  trade_wss_url: 'wss://services.alpha-broker.com/ws/v2',
});

const rawV2RoutingRecord = (overrides: Record<string, unknown> = {}) => ({
  directory_source: 'v2_raw' as const,
  id: 77,
  broker_id: 'myprop-trade',
  enabled: true,
  active: true,
  config_version: 'v2:77:1780582167',
  server_url: 'https://services.myprop.trade/',
  market_api_url: 'https://another-broker.example/api/v2',
  feed_wss_url: 'wss://services.myprop.trade/ws/feed',
  feed_ws_url: 'wss://services.myprop.trade/ws/feed',
  feed_url: 'ws://services.myprop.trade/ws/feed',
  feed_status_https_url: 'https://services.myprop.trade/ws/feed/status',
  feed_status_url: 'https://services.myprop.trade/ws/feed/status',
  ws_url: 'wss://other-broker.example/ws/feed',
  ...overrides,
});

test('strict broker URL normalization never upgrades schemes or accepts local/IP hosts', () => {
  assert.equal(
    normalizeBrokerHttpsUrl('https://services.alpha-broker.com/api/v2/'),
    'https://services.alpha-broker.com/api/v2',
  );
  assert.equal(
    normalizeBrokerWssUrl('wss://services.alpha-broker.com/ws/feed/'),
    'wss://services.alpha-broker.com/ws/feed',
  );

  for (const invalid of [
    'http://services.alpha-broker.com/api/v2',
    'ws://services.alpha-broker.com/ws/feed',
    'services.alpha-broker.com/api/v2',
    'https://127.0.0.1/api/v2',
    'https://10.1.2.3/api/v2',
    'https://[::1]/api/v2',
    'https://localhost/api/v2',
    'https://broker.internal/api/v2',
  ]) {
    assert.equal(normalizeBrokerHttpsUrl(invalid), '');
  }
  assert.equal(normalizeBrokerServerUrl('wss://services.alpha-broker.com/ws/feed'), '');
});

test('rich direct record resolves only its explicit endpoint set', () => {
  const result = resolveBrokerEndpointSet(richRecord());
  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.deepEqual(result.endpoints, {
    brokerId: 'alpha-broker',
    apiBase: 'https://services.alpha-broker.com/api/v2',
    feedWsBase: 'wss://services.alpha-broker.com/ws/feed',
    feedStatusUrl: 'https://services.alpha-broker.com/ws/feed/status',
    tradeWsBase: 'wss://services.alpha-broker.com/ws/v2',
    servicesDomain: 'services.alpha-broker.com',
    configVersion: '2026-07-17.1',
  });
  assert.equal(
    resolveBrokerServiceBaseUrl(richRecord()),
    'https://services.alpha-broker.com/api/v2',
  );
});

test('raw-v2 record resolves service-root server_url to REST base /api/v2', () => {
  const result = resolveBrokerEndpointSet(rawV2RoutingRecord());

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.mode, 'v2_raw');
  assert.deepEqual(result.endpoints, {
    brokerId: 'myprop-trade',
    apiBase: 'https://services.myprop.trade/api/v2',
    feedWsBase: 'wss://services.myprop.trade/ws/feed',
    feedStatusUrl: 'https://services.myprop.trade/ws/feed/status',
    tradeWsBase: 'wss://services.myprop.trade/ws/v2',
    servicesDomain: 'services.myprop.trade',
    configVersion: 'v2:77:1780582167',
  });
});

test('trade websocket uses an explicit same-host route or derives /ws/v2 from exact server_url', () => {
  assert.equal(
    deriveBrokerTradeWsBase('https://services.myprop.trade/api/v2'),
    'wss://services.myprop.trade/ws/v2',
  );
  assert.equal(deriveBrokerTradeWsBase('http://services.myprop.trade'), '');
  assert.equal(deriveBrokerTradeWsBase('https://127.0.0.1'), '');

  const explicit = resolveBrokerEndpointSet(rawV2RoutingRecord({
    trade_wss_url: 'wss://services.myprop.trade/custom/trade',
  }));
  assert.equal(explicit.ok, true);
  if (explicit.ok) {
    assert.equal(explicit.endpoints.tradeWsBase, 'wss://services.myprop.trade/custom/trade');
  }

  const richDerived = resolveBrokerEndpointSet({
    ...richRecord(),
    trade_wss_url: undefined,
  });
  assert.equal(richDerived.ok, true);
  if (richDerived.ok) {
    assert.equal(richDerived.endpoints.tradeWsBase, 'wss://services.alpha-broker.com/ws/v2');
  }

  const mismatched = resolveBrokerEndpointSet(rawV2RoutingRecord({
    trade_wss_url: 'wss://attacker.example/ws/v2',
  }));
  assert.equal(mismatched.ok ? '' : mismatched.code, 'invalid_trade_endpoint');
});

test('raw-v2 resolver requires enabled true and accepts active only when absent or true', () => {
  const missingEnabled = resolveBrokerEndpointSet(rawV2RoutingRecord({ enabled: undefined }));
  const disabled = resolveBrokerEndpointSet(rawV2RoutingRecord({ enabled: false }));
  const inactive = resolveBrokerEndpointSet(rawV2RoutingRecord({ active: false }));
  const nullActive = resolveBrokerEndpointSet(rawV2RoutingRecord({ active: null }));
  const activeAbsentRecord = rawV2RoutingRecord();
  Reflect.deleteProperty(activeAbsentRecord, 'active');
  const activeAbsent = resolveBrokerEndpointSet(activeAbsentRecord);

  assert.equal(missingEnabled.ok ? '' : missingEnabled.code, 'missing_enabled_approval');
  assert.equal(disabled.ok ? '' : disabled.code, 'disabled');
  assert.equal(inactive.ok ? '' : inactive.code, 'inactive');
  assert.equal(nullActive.ok ? '' : nullActive.code, 'inactive');
  assert.equal(activeAbsent.ok, true);
});

test('TEST-NET /24 is blocked in known routing fields while unknown metadata is ignored', () => {
  for (let suffix = 10; suffix <= 14; suffix += 1) {
    assert.equal(containsBlockedTestNetBrokerIp({
      server_url: 'https://valid.example',
      domains: { feed: `wss://203.0.113.${suffix}/ws/feed` },
    }), true);
  }
  assert.equal(containsBlockedTestNetBrokerIp({ server_ip: '203.0.113.15' }), true);
  assert.equal(containsBlockedTestNetBrokerIp({ feed_url: 'ws://203.0.113.200/ws/feed' }), true);
  assert.equal(containsBlockedTestNetBrokerIp({ server_ip: '203.0.114.10' }), false);
  assert.equal(containsBlockedTestNetBrokerIp({
    server_url: 'https://valid.example',
    notes: 'Historical example 203.0.113.10',
  }), false);

  const blocked = resolveBrokerEndpointSet({
    directory_source: 'v2_raw',
    broker_id: 'blocked',
    enabled: true,
    config_version: 'v2:1:1',
    server_url: 'https://valid.example',
    feed_wss_url: 'wss://valid.example/ws/feed',
    feed_status_https_url: 'https://valid.example/ws/feed/status',
    domains: { services: '203.0.113.14' },
  });
  assert.equal(blocked.ok ? '' : blocked.code, 'blocked_test_net_endpoint');
});

test('rich record requires explicit enabled, active, licensed, and version approvals', () => {
  const disabled = resolveBrokerEndpointSet({ ...richRecord(), enabled: false });
  const missingEnabled = resolveBrokerEndpointSet({ ...richRecord(), enabled: undefined });
  const inactive = resolveBrokerEndpointSet({ ...richRecord(), active: false });
  const missingActive = resolveBrokerEndpointSet({ ...richRecord(), active: undefined });
  const unlicensed = resolveBrokerEndpointSet({ ...richRecord(), license_active: false });
  const missingLicense = resolveBrokerEndpointSet({
    ...richRecord(),
    license_active: undefined,
    licensed: undefined,
  });
  const unversioned = resolveBrokerEndpointSet({ ...richRecord(), config_version: '' });

  assert.equal(disabled.ok ? '' : disabled.code, 'disabled');
  assert.equal(missingEnabled.ok ? '' : missingEnabled.code, 'missing_enabled_approval');
  assert.equal(inactive.ok ? '' : inactive.code, 'inactive');
  assert.equal(missingActive.ok ? '' : missingActive.code, 'missing_active_approval');
  assert.equal(unlicensed.ok ? '' : unlicensed.code, 'unlicensed');
  assert.equal(missingLicense.ok ? '' : missingLicense.code, 'missing_license_approval');
  assert.equal(unversioned.ok ? '' : unversioned.code, 'missing_config_version');
});

test('persisted session endpoint sets are rebound to their approved services domain', () => {
  const approved = revalidateBrokerSessionEndpointSet({
    brokerId: 'alpha-broker',
    apiBase: 'https://services.alpha-broker.com/api/v2',
    feedWsBase: 'wss://services.alpha-broker.com/ws/feed',
    feedStatusUrl: 'https://services.alpha-broker.com/ws/feed/status',
    tradeWsBase: 'wss://services.alpha-broker.com/ws/v2',
    servicesDomain: 'services.alpha-broker.com',
    configVersion: 'cfg-1',
  });
  assert.equal(approved.ok, true);

  const derived = revalidateBrokerSessionEndpointSet({
    brokerId: 'alpha-broker',
    apiBase: 'https://services.alpha-broker.com/api/v2',
    feedWsBase: 'wss://services.alpha-broker.com/ws/feed',
    feedStatusUrl: 'https://services.alpha-broker.com/ws/feed/status',
    servicesDomain: 'services.alpha-broker.com',
    configVersion: 'cfg-1',
  });
  assert.equal(derived.ok, true);
  if (derived.ok) {
    assert.equal(derived.endpoints.tradeWsBase, 'wss://services.alpha-broker.com/ws/v2');
  }

  const mismatch = revalidateBrokerSessionEndpointSet({
    brokerId: 'alpha-broker',
    apiBase: 'https://services.alpha-broker.com/api/v2',
    feedWsBase: 'wss://feed.attacker.example/ws/feed',
    feedStatusUrl: 'https://services.alpha-broker.com/ws/feed/status',
    servicesDomain: 'services.alpha-broker.com',
    configVersion: 'cfg-1',
  });
  assert.equal(mismatch.ok ? '' : mismatch.code, 'endpoint_host_mismatch');
});

test('opaque and generic legacy records cannot become authenticated routes', () => {
  const result = resolveBrokerEndpointSet({
    broker_id: 'opaque-broker',
    enabled: true,
    active: true,
    license_active: true,
    config_version: '1',
    services_domain: 'services.opaque-broker.com',
    server_url: 'https://services.opaque-broker.com',
    server: 'broker-server-42',
    region: 'us-east',
  } as Parameters<typeof resolveBrokerEndpointSet>[0] & { region: string });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, 'opaque_or_missing_endpoints');
  }
  assert.equal(resolveBrokerServiceBaseUrl({
    broker_id: 'opaque-broker',
    enabled: true,
    active: true,
    license_active: true,
    config_version: '1',
    services_domain: 'services.opaque-broker.com',
    server_url: 'https://services.opaque-broker.com',
  }), '');
});

test('direct endpoint validation rejects non-TLS, raw IP, and approved-host mismatch', () => {
  const insecureApi = resolveBrokerEndpointSet({
    ...richRecord(),
    market_api_url: 'http://services.alpha-broker.com/api/v2',
  });
  const insecureFeed = resolveBrokerEndpointSet({
    ...richRecord(),
    feed_wss_url: 'ws://services.alpha-broker.com/ws/feed',
  });
  const rawIp = resolveBrokerEndpointSet({
    ...richRecord(),
    services_domain: '10.10.0.8',
    market_api_url: 'https://10.10.0.8/api/v2',
    feed_wss_url: 'wss://10.10.0.8/ws/feed',
    feed_status_https_url: 'https://10.10.0.8/ws/feed/status',
    trade_wss_url: undefined,
  });
  const mismatch = resolveBrokerEndpointSet({
    ...richRecord(),
    feed_wss_url: 'wss://feed.attacker-vendor.com/ws/feed',
  });

  assert.equal(insecureApi.ok ? '' : insecureApi.code, 'invalid_api_endpoint');
  assert.equal(insecureFeed.ok ? '' : insecureFeed.code, 'invalid_feed_endpoint');
  assert.equal(rawIp.ok ? '' : rawIp.code, 'invalid_services_domain');
  assert.equal(mismatch.ok ? '' : mismatch.code, 'endpoint_host_mismatch');
});

test('conflicting explicit endpoint aliases fail closed', () => {
  const conflict = resolveBrokerEndpointSet({
    ...richRecord(),
    feed_ws_url: 'wss://services.alpha-broker.com/ws/other-feed',
  });
  assert.equal(conflict.ok, false);
  if (!conflict.ok) {
    assert.equal(conflict.code, 'conflicting_endpoint_fields');
  }
});

test('routing helpers map service roots to REST /api/v2 and health to service root', () => {
  assert.equal(
    ensureBrokerRestApiBase('https://services.myprop.trade'),
    'https://services.myprop.trade/api/v2',
  );
  assert.equal(
    ensureBrokerRestApiBase('https://services.myprop.trade/api/v2'),
    'https://services.myprop.trade/api/v2',
  );
  assert.equal(
    buildBrokerApiBaseUrl('https://services.myprop.trade'),
    'https://services.myprop.trade/api/v2',
  );
  assert.equal(
    buildBrokerApiBaseUrl('https://services.alpha-broker.com/api/v3'),
    'https://services.alpha-broker.com/api/v3',
  );
  assert.equal(buildBrokerApiBaseUrl('http://services.alpha-broker.com/api/v2'), '');
  assert.equal(
    toBrokerServiceRoot('https://services.myprop.trade/api/v2'),
    'https://services.myprop.trade',
  );
  assert.equal(
    buildBrokerHealthUrl('https://services.alpha-broker.com'),
    'https://services.alpha-broker.com/health',
  );
  assert.equal(
    buildBrokerHealthUrl('https://services.myprop.trade/api/v2'),
    'https://services.myprop.trade/health',
  );
  assert.equal(
    isBrokerServerUrlForApiBase(
      'https://services.myprop.trade',
      'https://services.myprop.trade/api/v2',
    ),
    true,
  );
  assert.equal(
    isBrokerServerUrlForApiBase(
      'https://services.myprop.trade/api/v2',
      'https://services.myprop.trade/api/v2',
    ),
    true,
  );
  assert.equal(
    isBrokerServerUrlForApiBase(
      'https://services.other.example',
      'https://services.myprop.trade/api/v2',
    ),
    false,
  );
  assert.equal(
    buildBrokerWsUrl('wss://services.alpha-broker.com/ws/feed', '/ws/feed', 'wss://fallback.test/ws/feed'),
    'wss://services.alpha-broker.com/ws/feed',
  );
  assert.equal(
    buildBrokerWsUrl('https://services.alpha-broker.com', '/ws/feed', 'wss://fallback.test/ws/feed'),
    '',
  );
  assert.equal(
    normalizeConfiguredWsUrl('ws://services.alpha-broker.com/ws/feed', 'wss://fallback.test/ws/feed'),
    '',
  );
  assert.equal(
    normalizeConfiguredWsUrl('', 'wss://fallback.test/ws/feed'),
    '',
  );
});

test('API URL joining rejects absolute endpoints outside the captured API base', () => {
  assert.equal(
    buildApiUrl('/quotes', 'https://services.alpha-broker.com/api/v2'),
    'https://services.alpha-broker.com/api/v2/quotes',
  );
  assert.equal(
    buildApiUrl(
      'https://services.alpha-broker.com/api/v2/quotes',
      'https://services.alpha-broker.com/api/v2',
    ),
    'https://services.alpha-broker.com/api/v2/quotes',
  );
  assert.throws(
    () => buildApiUrl(
      'https://other-broker.com/api/v2/quotes',
      'https://services.alpha-broker.com/api/v2',
    ),
    /outside the active broker API base/,
  );
});

test('versioned broker API routes retain the selected broker authority', () => {
  assert.equal(
    buildVersionedBrokerApiUrl(
      '/journal?mode=2&type=0&filter=%20',
      'https://services.alpha-broker.com/api/v2',
      'v1',
    ),
    'https://services.alpha-broker.com/api/v1/journal?mode=2&type=0&filter=%20',
  );
  assert.throws(
    () => buildVersionedBrokerApiUrl(
      'https://other-broker.com/api/v1/journal',
      'https://services.alpha-broker.com/api/v2',
      'v1',
    ),
    /outside the active broker API base/,
  );
});
