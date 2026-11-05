import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BrokerDirectorySchemaError,
  parseBrokerDirectoryListingPayload,
  parseBrokerDirectoryPayload,
} from './broker';
import { resolveBrokerEndpointSet } from './brokerRouting';

const richDirectoryRecord = () => ({
  id: 7,
  broker_id: 'alpha-broker',
  broker_name: 'Alpha Broker',
  enabled: true,
  active: true,
  license_active: true,
  config_version: 'cfg-7',
  services_domain: 'services.alpha-broker.com',
  server_url: 'https://services.alpha-broker.com/api/v2',
  market_api_url: 'https://services.alpha-broker.com/api/v2',
  feed_wss_url: 'wss://services.alpha-broker.com/ws/feed',
  feed_status_https_url: 'https://services.alpha-broker.com/ws/feed/status',
  trade_wss_url: 'wss://services.alpha-broker.com/ws/v2',
  logo_url: 'https://cdn.alpha-broker.com/logo.png',
  protocol: 'mt5',
  region: 'eu-west',
  server: 'AlphaBroker-Live',
  server_ip: 'broker-server-7',
  server_port: 443,
  created_at: 1_768_435_200,
});

const rawV2Record = (overrides: Record<string, unknown> = {}) => ({
  id: 73,
  broker_id: 'gta_broker',
  broker_name: 'Grow Trading Academy',
  enabled: true,
  active: true,
  server_url: 'https://services.growtradingacademy.com',
  // Raw-v2 routing must ignore this alias and use server_url exactly.
  market_api_url: 'https://services.growtradingacademy.com',
  feed_wss_url: 'wss://services.growtradingacademy.com/ws/feed',
  feed_ws_url: 'wss://services.growtradingacademy.com/ws/feed',
  feed_status_https_url: 'https://services.growtradingacademy.com/ws/feed/status',
  feed_status_url: 'https://services.growtradingacademy.com/ws/feed/status',
  logo_url: 'https://cdn.example.com/gta.png',
  protocol: 'https',
  region: 'Global',
  server: 'services.growtradingacademy.com:443',
  server_ip: '103.91.186.142',
  server_port: 443,
  created_at: 1_779_862_635,
  ...overrides,
});

const expectSchemaError = (run: () => unknown, code: string) => {
  assert.throws(run, (error: unknown) => {
    assert.ok(error instanceof BrokerDirectorySchemaError);
    assert.equal(error.code, code);
    return true;
  });
};

test('versioned rich directory parser returns only exact validated endpoints', () => {
  const records = parseBrokerDirectoryPayload({
    schema_version: 'broker-directory.rich.v1',
    brokers: [richDirectoryRecord()],
  });

  assert.equal(records.length, 1);
  assert.equal(Object.isFrozen(records[0]), true);
  assert.equal(records[0].schema_version, 'broker-directory.rich.v1');
  assert.equal(records[0].config_version, 'cfg-7');
  assert.equal(records[0].services_domain, 'services.alpha-broker.com');
  assert.equal(records[0].market_api_url, 'https://services.alpha-broker.com/api/v2');
  assert.equal(records[0].feed_wss_url, 'wss://services.alpha-broker.com/ws/feed');
  assert.equal(
    records[0].feed_status_https_url,
    'https://services.alpha-broker.com/ws/feed/status',
  );
  assert.equal(records[0].trade_wss_url, 'wss://services.alpha-broker.com/ws/v2');
});

test('listing parser exposes approved entries only for the supported rich envelope', () => {
  const result = parseBrokerDirectoryListingPayload({
    schema_version: 'broker-directory.rich.v1',
    brokers: [richDirectoryRecord()],
  });

  assert.equal(result.mode, 'approved');
  assert.equal(result.warningCode, undefined);
  assert.equal(result.entries.length, 1);
  assert.equal(result.entries[0].kind, 'approved');
  assert.equal(result.approvedServers.length, 1);
  assert.equal(result.approvedServers[0].broker_id, 'alpha-broker');
});

test('live-shaped raw v2 Achiever, GTA, MyProp, and Orrnn Demo rows remain selectable', () => {
  const liveLikeRows = [
    rawV2Record({
      id: 79,
      broker_id: 'achiever-financials',
      broker_name: 'Achiever Financials LTD',
      server_url: 'https://service.achieverfinancials.com',
      market_api_url: 'https://service.achieverfinancials.com',
      feed_wss_url: 'wss://service.achieverfinancials.com/ws/feed',
      feed_ws_url: 'wss://service.achieverfinancials.com/ws/feed',
      feed_status_https_url: 'https://service.achieverfinancials.com/ws/feed/status',
      feed_status_url: 'https://service.achieverfinancials.com/ws/feed/status',
      server: 'service.achieverfinancials.com:443',
      server_ip: '66.23.232.22',
      created_at: 1_782_480_612,
      future_capability: { version: 2 },
      notes: 'Historical fixture 203.0.113.10 is not a routing field.',
    }),
    rawV2Record(),
    rawV2Record({
      id: 77,
      broker_id: 'myprop-trade',
      broker_name: 'MyProp',
      server_url: 'https://services.myprop.trade/',
      market_api_url: 'https://alternate.example/api/v2',
      feed_wss_url: 'wss://services.myprop.trade/ws/feed',
      feed_ws_url: 'wss://services.myprop.trade/ws/feed',
      feed_status_https_url: 'https://services.myprop.trade/ws/feed/status',
      feed_status_url: 'https://services.myprop.trade/ws/feed/status',
      server: 'services.myprop.trade:443',
      server_ip: '185.204.168.202',
      created_at: 1_780_582_167,
    }),
    rawV2Record({
      id: 80,
      broker_id: 'orrnn-demo',
      broker_name: 'Orrnn Broker demo',
      server_url: 'https://demobackend.orrnn.com',
      market_api_url: 'https://demobackend.orrnn.com',
      feed_wss_url: 'wss://demobackend.orrnn.com/ws/feed',
      feed_ws_url: 'wss://demobackend.orrnn.com/ws/feed',
      feed_status_https_url: 'https://demobackend.orrnn.com/ws/feed/status',
      feed_status_url: 'https://demobackend.orrnn.com/ws/feed/status',
      server: 'demobackend.orrnn.com:443',
      server_ip: '69.197.178.27',
      created_at: 1_784_199_260,
    }),
    rawV2Record({
      id: 21,
      broker_id: 'Nexa',
      broker_name: 'Nexa',
      server_url: 'https://nexa.orrnn.com',
      market_api_url: 'https://nexa.orrnn.com',
      feed_wss_url: 'wss://nexa.orrnn.com/ws/feed',
      feed_ws_url: 'wss://nexa.orrnn.com/ws/feed',
      feed_status_https_url: 'https://nexa.orrnn.com/ws/feed/status',
      feed_status_url: 'https://nexa.orrnn.com/ws/feed/status',
      server: 'nexa.orrnn.com:443',
      server_ip: '100.119.182.26',
      created_at: 1_789_459_348,
    }),
  ];

  const result = parseBrokerDirectoryListingPayload(liveLikeRows);

  assert.equal(result.mode, 'v2');
  assert.equal(result.warningCode, undefined);
  assert.deepEqual(result.approvedServers, []);
  assert.equal(result.entries.every((entry) => entry.kind === 'v2_server'), true);
  assert.deepEqual(
    result.selectableServers.map((record) => [record.broker_id, record.server_url]),
    [
      ['achiever-financials', 'https://service.achieverfinancials.com'],
      ['gta_broker', 'https://services.growtradingacademy.com'],
      ['myprop-trade', 'https://services.myprop.trade'],
      ['orrnn-demo', 'https://demobackend.orrnn.com'],
      ['Nexa', 'https://nexa.orrnn.com'],
    ],
  );
  // REST base is derived from the exact service-root server_url.
  assert.equal(
    result.selectableServers[2].market_api_url,
    'https://services.myprop.trade/api/v2',
  );
  assert.equal('future_capability' in result.selectableServers[0], false);
  assert.equal('notes' in result.selectableServers[0], false);

  // The strict rich-envelope parser remains strict for the same raw array.
  expectSchemaError(() => parseBrokerDirectoryPayload(liveLikeRows), 'missing_schema_version');
});

test('raw v2 requires enabled true and excludes disabled or explicitly inactive rows', () => {
  expectSchemaError(
    () => parseBrokerDirectoryListingPayload([
      rawV2Record({ enabled: undefined }),
    ]),
    'missing_enabled_approval',
  );

  const activeAbsent = rawV2Record({
    id: 81,
    broker_id: 'active-omitted',
    broker_name: 'Active Omitted Broker',
  });
  Reflect.deleteProperty(activeAbsent, 'active');

  const result = parseBrokerDirectoryListingPayload([
    rawV2Record({ id: 82, broker_id: 'disabled', enabled: false }),
    rawV2Record({ id: 83, broker_id: 'inactive', active: false }),
    rawV2Record({ id: 84, broker_id: 'null-active', active: null }),
    rawV2Record({ id: 85, broker_id: 'inactive-status', status: 'inactive' }),
    activeAbsent,
  ]);

  assert.deepEqual(
    result.selectableServers.map((record) => record.broker_id),
    ['active-omitted'],
  );
  assert.equal('active' in result.selectableServers[0], false);
});

test('raw v2 requires server metadata and an HTTPS protocol declaration', () => {
  for (const field of ['server', 'server_ip', 'protocol'] as const) {
    expectSchemaError(
      () => parseBrokerDirectoryListingPayload([
        rawV2Record({ [field]: ' ' }),
      ]),
      `missing_${field}`,
    );
  }

  expectSchemaError(
    () => parseBrokerDirectoryListingPayload([
      rawV2Record({ protocol: 'http' }),
    ]),
    'invalid_protocol',
  );

  const caseInsensitive = parseBrokerDirectoryListingPayload([
    rawV2Record({ protocol: 'HTTPS' }),
  ]);
  assert.equal(caseInsensitive.selectableServers[0].protocol, 'https');
});

test('TEST-NET 203.0.113.0/24 rows are hidden from known endpoint and IP fields', () => {
  const result = parseBrokerDirectoryListingPayload([
    rawV2Record({ id: 10, broker_id: 'bad-ip', server_ip: '203.0.113.10' }),
    rawV2Record({ id: 11, broker_id: 'bad-server', server: '203.0.113.11:443' }),
    rawV2Record({ id: 12, broker_id: 'bad-url', server_url: 'https://203.0.113.12:443' }),
    rawV2Record({ id: 13, broker_id: 'bad-feed', feed_url: 'ws://203.0.113.13/ws/feed' }),
    rawV2Record({
      id: 14,
      broker_id: 'bad-nested',
      domains: { services: '203.0.113.14' },
    }),
    rawV2Record({ id: 200, broker_id: 'bad-other-octet', server_ip: '203.0.113.200' }),
    rawV2Record(),
  ]);

  assert.equal(result.mode, 'v2');
  assert.deepEqual(
    result.selectableServers.map((record) => record.broker_id),
    ['gta_broker'],
  );
  assert.deepEqual(
    result.entries.map((entry) => entry.kind === 'v2_server' ? entry.server.broker_id : ''),
    ['gta_broker'],
  );
});

test('documented legacy value wrapper is identity-only and unknown envelopes still fail', () => {
  const legacyResult = parseBrokerDirectoryListingPayload({
    value: [{
      id: 'legacy-7',
      broker_id: 'legacy-broker',
      broker_name: 'Legacy Broker',
      server_url: 'https://unapproved.example',
    }],
  });

  assert.equal(legacyResult.mode, 'identity_only');
  assert.deepEqual(legacyResult.entries, [{
    kind: 'identity_only',
    id: 'legacy-7',
    brokerId: 'legacy-broker',
    brokerName: 'Legacy Broker',
  }]);
  assert.deepEqual(legacyResult.approvedServers, []);

  expectSchemaError(
    () => parseBrokerDirectoryListingPayload({ brokers: [richDirectoryRecord()] }),
    'missing_schema_version',
  );
  expectSchemaError(
    () => parseBrokerDirectoryListingPayload({
      schema_version: 'broker-directory.rich.v2',
      brokers: [richDirectoryRecord()],
    }),
    'unsupported_schema_version',
  );
});

test('one malformed or explicitly disabled raw-v2 record cannot hide a valid broker', () => {
  const result = parseBrokerDirectoryListingPayload([
    null,
    { id: 1, broker_id: '', broker_name: 'Malformed Broker' },
    rawV2Record({
      id: 2,
      broker_id: 'disabled-broker',
      broker_name: 'Disabled Broker',
      enabled: false,
    }),
    rawV2Record(),
  ]);

  assert.equal(result.mode, 'v2');
  assert.deepEqual(result.selectableServers.map((record) => record.broker_id), ['gta_broker']);
  expectSchemaError(
    () => parseBrokerDirectoryListingPayload([null, { broker_id: 'missing-id' }]),
    'malformed_record',
  );
});

test('unversioned arrays and envelopes fail closed as release-contract blockers', () => {
  const liveRow = {
    ...richDirectoryRecord(),
    enabled: undefined,
    active: undefined,
    config_version: undefined,
  };
  expectSchemaError(() => parseBrokerDirectoryPayload([liveRow]), 'missing_schema_version');
  expectSchemaError(
    () => parseBrokerDirectoryPayload({ brokers: [liveRow] }),
    'missing_schema_version',
  );
});

test('unknown schema versions and missing per-record approvals fail closed', () => {
  expectSchemaError(
    () => parseBrokerDirectoryPayload({
      schema_version: 'broker-directory.rich.v2',
      brokers: [richDirectoryRecord()],
    }),
    'unsupported_schema_version',
  );
  for (const [field, code] of [
    ['enabled', 'missing_enabled_approval'],
    ['active', 'missing_active_approval'],
    ['license_active', 'missing_license_approval'],
    ['config_version', 'missing_config_version'],
  ] as const) {
    expectSchemaError(
      () => parseBrokerDirectoryPayload({
        schema_version: 'broker-directory.rich.v1',
        brokers: [{ ...richDirectoryRecord(), [field]: undefined }],
      }),
      code,
    );
  }
});

test('opaque broker handles are rejected instead of producing client domains', () => {
  expectSchemaError(
    () => parseBrokerDirectoryPayload({
      schema_version: 'broker-directory.rich.v1',
      brokers: [{
        ...richDirectoryRecord(),
        market_api_url: undefined,
        feed_wss_url: undefined,
        feed_status_https_url: undefined,
        server: 'broker-server-7',
      }],
    }),
    'opaque_or_missing_endpoints',
  );
});

test('invalid records are rejected without hiding unrelated valid brokers', () => {
  const records = parseBrokerDirectoryPayload({
    schema_version: 'broker-directory.rich.v1',
    brokers: [
      richDirectoryRecord(),
      { ...richDirectoryRecord(), broker_id: 'disabled-broker', enabled: false },
    ],
  });
  assert.deepEqual(records.map((record) => record.broker_id), ['alpha-broker']);

  expectSchemaError(
    () => parseBrokerDirectoryPayload({
      schema_version: 'broker-directory.rich.v1',
      brokers: [
        { ...richDirectoryRecord(), broker_id: 'disabled-broker', enabled: false },
      ],
    }),
    'disabled',
  );
});

test('ambiguous record collections and conflicting endpoint aliases are rejected', () => {
  expectSchemaError(
    () => parseBrokerDirectoryPayload({
      schema_version: 'broker-directory.rich.v1',
      brokers: [],
      value: [],
    }),
    'ambiguous_directory_records',
  );
  expectSchemaError(
    () => parseBrokerDirectoryPayload({
      schema_version: 'broker-directory.rich.v1',
      brokers: [{
        ...richDirectoryRecord(),
        feed_ws_url: 'wss://services.alpha-broker.com/ws/another-feed',
      }],
    }),
    'conflicting_endpoint_fields',
  );
});

test('malformed display metadata is rejected rather than defaulted', () => {
  expectSchemaError(
    () => parseBrokerDirectoryPayload({
      schema_version: 'broker-directory.rich.v1',
      brokers: [{ ...richDirectoryRecord(), broker_name: '' }],
    }),
    'missing_broker_name',
  );
});

// ─── Backend contract v3 (2026-09-24): Trivanta + Orrnn ────────────────────────

/** Section 3 target rows: https/wss hostnames, no `enabled`/`active` keys. */
const contractV3TargetRows = () => [
  {
    id: 3,
    broker_id: 'trivanta-markets',
    broker_name: 'Trivanta Markets',
    created_at: 1_789_633_122,
    protocol: 'https',
    server: 'trivanta.orrnn.com:443',
    server_ip: '<unchanged>',
    server_port: 443,
    server_url: 'https://trivanta.orrnn.com',
    market_api_url: 'https://trivanta.orrnn.com',
    services_domain: 'trivanta.orrnn.com',
    feed_wss_url: 'wss://trivanta.orrnn.com/ws/feed',
    feed_status_https_url: 'https://trivanta.orrnn.com/ws/feed/status',
  },
  {
    id: 4,
    broker_id: 'Orrnn',
    broker_name: 'ORRNN',
    created_at: 1_789_643_254,
    protocol: 'https',
    server: 'service.orrnn.com:443',
    server_ip: '<unchanged>',
    server_port: 443,
    server_url: 'https://service.orrnn.com',
    market_api_url: 'https://service.orrnn.com',
    services_domain: 'service.orrnn.com',
    feed_wss_url: 'wss://service.orrnn.com/ws/feed',
    feed_status_https_url: 'https://service.orrnn.com/ws/feed/status',
  },
];

test('contract v3 target rows (no enabled key) are selectable with exact endpoints', () => {
  const result = parseBrokerDirectoryListingPayload(contractV3TargetRows());

  assert.equal(result.mode, 'v2');
  assert.deepEqual(
    result.selectableServers.map((server) => [
      server.broker_id,
      server.server_url,
      server.market_api_url,
      server.feed_wss_url,
      server.feed_status_https_url,
      server.trade_wss_url,
    ]),
    [
      [
        'trivanta-markets',
        'https://trivanta.orrnn.com',
        'https://trivanta.orrnn.com/api/v2',
        'wss://trivanta.orrnn.com/ws/feed',
        'https://trivanta.orrnn.com/ws/feed/status',
        // trade_wss_url is not sent; it is derived as wss://{host}/ws/v2.
        'wss://trivanta.orrnn.com/ws/v2',
      ],
      [
        // broker_id keeps its exact directory case: login sends "Orrnn".
        'Orrnn',
        'https://service.orrnn.com',
        'https://service.orrnn.com/api/v2',
        'wss://service.orrnn.com/ws/feed',
        'https://service.orrnn.com/ws/feed/status',
        'wss://service.orrnn.com/ws/v2',
      ],
    ],
  );
});

test('contract v3 extra alias keys holding identical values are not a conflict', () => {
  const [trivanta, orrnn] = contractV3TargetRows();
  const withAliases = {
    ...trivanta,
    feed_ws_url: 'wss://trivanta.orrnn.com/ws/feed',
    feed_url: 'wss://trivanta.orrnn.com/ws/feed',
    ws_url: 'wss://trivanta.orrnn.com/ws/feed',
    wss_url: 'wss://trivanta.orrnn.com/ws/feed',
    feed_status_url: 'https://trivanta.orrnn.com/ws/feed/status',
    domain_name: 'trivanta.orrnn.com',
    server_domain: 'trivanta.orrnn.com',
    admin_domain: 'admin.trivanta.orrnn.com',
    domains: { domain_name: 'trivanta.orrnn.com', server: 'trivanta.orrnn.com' },
    logo_url: 'https://superadmin-prod.orrnn.com/api/v1/brokers/trivanta-markets/logo',
  };

  const result = parseBrokerDirectoryListingPayload([withAliases, orrnn]);
  assert.deepEqual(
    result.selectableServers.map((server) => server.broker_id),
    ['trivanta-markets', 'Orrnn'],
  );
  assert.equal(result.selectableServers[0].feed_wss_url, 'wss://trivanta.orrnn.com/ws/feed');
});

/** Section 3 "live rows today": raw IPs with ws:// and http:// feed URLs. */
const contractV3LiveRawIpRows = () => [
  {
    id: 3,
    broker_id: 'trivanta-markets',
    broker_name: 'Trivanta Markets',
    created_at: 1_789_633_122,
    protocol: 'https',
    server: '100.116.90.110:443',
    server_ip: '100.116.90.110',
    server_port: 443,
    server_url: 'https://100.116.90.110:443',
    market_api_url: 'http://100.116.90.110',
    services_domain: '',
    feed_url: 'ws://100.116.90.110/ws/feed',
    feed_ws_url: 'ws://100.116.90.110/ws/feed',
    ws_url: 'ws://100.116.90.110/ws/feed',
    feed_status_url: 'http://100.116.90.110/ws/feed/status',
    logo_url: 'http://superadmin-prod.orrnn.com/api/v1/brokers/trivanta-markets/logo',
    domains: { domain_name: '', server: '100.116.90.110' },
  },
  {
    id: 4,
    broker_id: 'Orrnn',
    broker_name: 'ORRNN',
    created_at: 1_789_643_254,
    protocol: 'https',
    server: '51.195.188.172:443',
    server_ip: '51.195.188.172',
    server_port: 443,
    server_url: 'https://51.195.188.172:443',
    market_api_url: 'http://51.195.188.172',
    services_domain: '',
    feed_url: 'ws://51.195.188.172/ws/feed',
    feed_ws_url: 'ws://51.195.188.172/ws/feed',
    ws_url: 'ws://51.195.188.172/ws/feed',
    feed_status_url: 'http://51.195.188.172/ws/feed/status',
    logo_url: 'http://superadmin-prod.orrnn.com/api/v1/brokers/Orrnn/logo',
    domains: { domain_name: '', server: '51.195.188.172' },
  },
];

test('current live raw-IP rows recover to the contract-published hostnames', () => {
  // superadmin-prod still serves these rows (raw IP server_url, ws:// and
  // http:// feed fields, no feed_wss_url). For exactly the two Contract v3
  // brokers the app falls back to their published hostnames, keeping the
  // directory broker_id case ("Orrnn") for login.
  const result = parseBrokerDirectoryListingPayload(contractV3LiveRawIpRows());
  assert.deepEqual(
    result.selectableServers.map((server) => [
      server.broker_id,
      server.broker_name,
      server.server_url,
      server.feed_wss_url,
      server.feed_status_https_url,
      server.trade_wss_url,
    ]),
    [
      [
        'trivanta-markets',
        'Trivanta Markets',
        'https://trivanta.orrnn.com',
        'wss://trivanta.orrnn.com/ws/feed',
        'https://trivanta.orrnn.com/ws/feed/status',
        'wss://trivanta.orrnn.com/ws/v2',
      ],
      [
        'Orrnn',
        'ORRNN',
        'https://service.orrnn.com',
        'wss://service.orrnn.com/ws/feed',
        'https://service.orrnn.com/ws/feed/status',
        'wss://service.orrnn.com/ws/v2',
      ],
    ],
  );
  for (const server of result.selectableServers) {
    const resolution = resolveBrokerEndpointSet(server);
    assert.equal(resolution.ok, true, server.broker_id);
  }
});

test('raw-IP rows for any broker without a published hostname stay rejected', () => {
  const unpinnedRows = contractV3LiveRawIpRows().map((row, index) => ({
    ...row,
    broker_id: `unlisted-broker-${index}`,
  }));
  // Every row fails, so the listing surfaces an error instead of an empty list.
  assert.throws(
    () => parseBrokerDirectoryListingPayload(unpinnedRows),
    (error: unknown) => error instanceof BrokerDirectorySchemaError,
  );

  // Even with a wss:// feed field added, a raw-IP server_url stays rejected.
  for (const row of unpinnedRows) {
    const host = row.server_ip;
    expectSchemaError(
      () => parseBrokerDirectoryListingPayload([{
        ...row,
        feed_wss_url: `wss://${host}/ws/feed`,
        feed_status_https_url: `https://${host}/ws/feed/status`,
      }]),
      'invalid_server_url',
    );
  }
});

test('a hostname row with ws:// or http:// feed endpoints stays rejected', () => {
  const [trivanta] = contractV3TargetRows();
  const unlisted = {
    ...trivanta,
    broker_id: 'unlisted-broker',
    server: 'services.unlisted-broker.com:443',
    server_url: 'https://services.unlisted-broker.com',
    market_api_url: 'https://services.unlisted-broker.com',
    services_domain: 'services.unlisted-broker.com',
    feed_wss_url: 'wss://services.unlisted-broker.com/ws/feed',
    feed_status_https_url: 'https://services.unlisted-broker.com/ws/feed/status',
  };
  expectSchemaError(
    () => parseBrokerDirectoryListingPayload([{
      ...unlisted,
      feed_wss_url: 'ws://services.unlisted-broker.com/ws/feed',
    }]),
    'invalid_feed_endpoint',
  );
  expectSchemaError(
    () => parseBrokerDirectoryListingPayload([{
      ...unlisted,
      feed_status_https_url: 'http://services.unlisted-broker.com/ws/feed/status',
    }]),
    'invalid_status_endpoint',
  );
  expectSchemaError(
    () => parseBrokerDirectoryListingPayload([{
      ...unlisted,
      server_url: 'http://services.unlisted-broker.com',
    }]),
    'invalid_server_url',
  );

  // A published broker never keeps a cleartext endpoint either: its unusable
  // row is replaced wholesale by the pinned wss:// / https:// endpoint set.
  const recovered = parseBrokerDirectoryListingPayload([{
    ...trivanta,
    feed_wss_url: 'ws://trivanta.orrnn.com/ws/feed',
  }]);
  assert.equal(recovered.selectableServers[0].feed_wss_url, 'wss://trivanta.orrnn.com/ws/feed');
});

test('a valid directory row always wins over the pinned fallback', () => {
  const [trivanta, orrnn] = contractV3TargetRows();
  const [, orrnnLive] = contractV3LiveRawIpRows();
  const unlistedRawIp = { ...orrnnLive, broker_id: 'unlisted-broker' };
  const result = parseBrokerDirectoryListingPayload([orrnnLive, trivanta, unlistedRawIp]);
  assert.deepEqual(
    result.selectableServers.map((server) => server.broker_id),
    ['Orrnn', 'trivanta-markets'],
  );

  // If ops publishes a different valid hostname, the app follows the directory.
  const movedOrrnn = {
    ...orrnn,
    server: 'api.orrnn.com:443',
    server_url: 'https://api.orrnn.com',
    market_api_url: 'https://api.orrnn.com',
    services_domain: 'api.orrnn.com',
    feed_wss_url: 'wss://api.orrnn.com/ws/feed',
    feed_status_https_url: 'https://api.orrnn.com/ws/feed/status',
  };
  const moved = parseBrokerDirectoryListingPayload([movedOrrnn]);
  assert.equal(moved.selectableServers[0].server_url, 'https://api.orrnn.com');
});
