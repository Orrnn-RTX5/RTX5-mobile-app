import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseBrokerDirectoryListingPayload,
  type BrokerDirectoryEntry,
  type BrokerServer,
} from '../../../api/broker';
import {
  buildBrokerDirectoryRows,
  normalizeBrokerLogoUrl,
  resolveBrokerLogoUrl,
  sortBrokerDirectoryRows,
} from './brokerDirectoryRows';

const broker = (
  overrides: Partial<BrokerServer> & Pick<BrokerServer, 'broker_id' | 'broker_name'>,
): BrokerServer => {
  const { broker_id, broker_name, ...rest } = overrides;
  return {
    id: 1,
    protocol: 'https',
    region: 'Global',
    server: '203.0.113.10:443',
    server_ip: '203.0.113.10',
    server_port: 443,
    created_at: 1,
    ...rest,
    broker_id,
    broker_name,
  };
};

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

test('broker logo URLs normalize explicit origins without fabricating an unconfigured directory host', () => {
  assert.equal(
    normalizeBrokerLogoUrl(' http://cdn.example.com/logo.png '),
    'https://cdn.example.com/logo.png',
  );
  assert.equal(
    normalizeBrokerLogoUrl('//cdn.example.com/logo.png'),
    'https://cdn.example.com/logo.png',
  );
  assert.equal(
    normalizeBrokerLogoUrl('/brokers/example/logo'),
    '/brokers/example/logo',
  );
  assert.equal(
    normalizeBrokerLogoUrl('assets/logo.png'),
    'assets/logo.png',
  );
});

test('broker logo resolver honors direct and nested backend fields', () => {
  assert.equal(
    resolveBrokerLogoUrl(broker({
      broker_id: 'direct',
      broker_name: 'Direct Broker',
      logo_url: 'https://cdn.example.com/direct.png',
    })),
    'https://cdn.example.com/direct.png',
  );

  const nested = broker({ broker_id: 'nested', broker_name: 'Nested Broker' }) as BrokerServer & {
    branding: { image_url: string };
  };
  nested.branding = { image_url: '/images/nested.png' };
  assert.equal(
    resolveBrokerLogoUrl(nested),
    '/images/nested.png',
  );
});

test('raw v2 hides TEST-NET rows and keeps exact valid server_url selectable', () => {
  const directory = parseBrokerDirectoryListingPayload([
    {
      id: 11,
      broker_id: 'placeholder-broker',
      broker_name: 'Placeholder Broker',
      enabled: true,
      active: true,
      server: '203.0.113.10:443',
      server_url: 'https://placeholder.example',
      feed_wss_url: 'wss://placeholder.example/ws/feed',
      feed_status_https_url: 'https://placeholder.example/ws/feed/status',
      protocol: 'https',
      region: 'Global',
      server_ip: '203.0.113.10',
      server_port: 443,
      created_at: 1_768_435_200,
    },
    {
      id: 77,
      broker_id: 'myprop-trade',
      broker_name: 'MyProp',
      enabled: true,
      active: true,
      server: 'services.myprop.trade:443',
      server_url: 'https://services.myprop.trade/',
      market_api_url: 'https://alternate.example/api/v2',
      feed_wss_url: 'wss://services.myprop.trade/ws/feed',
      feed_status_https_url: 'https://services.myprop.trade/ws/feed/status',
      logo_url: 'https://cdn.example.com/myprop.png',
      protocol: 'https',
      region: 'Global',
      server_ip: '185.204.168.202',
      server_port: 443,
      created_at: 1_780_582_167,
    },
  ]);

  const rows = buildBrokerDirectoryRows(directory.entries);

  assert.equal(directory.mode, 'v2');
  assert.deepEqual(
    directory.selectableServers.map((record) => record.broker_id),
    ['myprop-trade'],
  );
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], {
    id: 'srv-77',
    brokerId: 'myprop-trade',
    name: 'MyProp',
    server: 'MyProp',
    selectable: true,
    serverUrl: 'https://services.myprop.trade',
    feedStatusUrl: 'https://services.myprop.trade/ws/feed/status',
    logoUrl: 'https://cdn.example.com/myprop.png',
    region: 'Global',
    protocol: 'https',
    domain: 'services.myprop.trade',
  });
});

test('supported rich envelope produces a selectable row with exact approved authority', () => {
  const directory = parseBrokerDirectoryListingPayload({
    schema_version: 'broker-directory.rich.v1',
    brokers: [richDirectoryRecord()],
  });

  const rows = buildBrokerDirectoryRows(directory.entries);

  assert.equal(directory.mode, 'approved');
  assert.deepEqual(rows, [{
    id: 'srv-7',
    brokerId: 'alpha-broker',
    name: 'Alpha Broker',
    server: 'AlphaBroker-Live',
    selectable: true,
    serverUrl: 'https://services.alpha-broker.com',
    feedStatusUrl: 'https://services.alpha-broker.com/ws/feed/status',
    logoUrl: 'https://cdn.alpha-broker.com/logo.png',
    region: 'eu-west',
    protocol: 'mt5',
    domain: 'services.alpha-broker.com',
  }]);
});

test('runtime row refuses an approved entry whose server_url differs from its resolved API base', () => {
  const approved = parseBrokerDirectoryListingPayload({
    schema_version: 'broker-directory.rich.v1',
    brokers: [richDirectoryRecord()],
  }).entries[0];
  assert.equal(approved.kind, 'approved');
  if (approved.kind !== 'approved') return;

  const rows = buildBrokerDirectoryRows([{
    kind: 'approved',
    server: {
      ...approved.server,
      server_url: 'https://other-broker.example/api/v2',
    },
  }]);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].selectable, false);
  assert.equal(rows[0].serverUrl, '');
});

test('dedupe by broker ID always promotes the approved entry over identity-only data', () => {
  const approved = parseBrokerDirectoryListingPayload({
    schema_version: 'broker-directory.rich.v1',
    brokers: [richDirectoryRecord()],
  }).entries[0];
  const identity: BrokerDirectoryEntry = {
    kind: 'identity_only',
    id: 'legacy-7',
    brokerId: 'ALPHA-BROKER',
    brokerName: 'Untrusted Alpha Label',
  };

  for (const entries of [
    [identity, approved],
    [approved, identity],
  ]) {
    const rows = buildBrokerDirectoryRows(entries);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].selectable, true);
    assert.equal(rows[0].name, 'Alpha Broker');
    assert.equal(rows[0].serverUrl, 'https://services.alpha-broker.com');
  }
});

test('shared broker ordering pins MetaQuotes then sorts names', () => {
  const rows = buildBrokerDirectoryRows([
    { kind: 'identity_only', id: '1', brokerId: 'zeta', brokerName: 'Zeta Broker' },
    { kind: 'identity_only', id: '2', brokerId: 'metaquotes', brokerName: 'MetaQuotes Ltd.' },
    { kind: 'identity_only', id: '3', brokerId: 'alpha', brokerName: 'Alpha Broker' },
  ]);

  assert.deepEqual(
    sortBrokerDirectoryRows(rows).map((row) => row.name),
    ['MetaQuotes Ltd.', 'Alpha Broker', 'Zeta Broker'],
  );
});
