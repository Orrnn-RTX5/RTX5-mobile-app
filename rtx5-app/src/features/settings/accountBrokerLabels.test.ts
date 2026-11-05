import assert from 'node:assert/strict';
import test from 'node:test';
import type { BrokerServer } from '../../api/broker';
import { resolveAccountBrokerLabels } from './accountBrokerLabels';

const server = (overrides: Partial<BrokerServer> = {}): BrokerServer => ({
  id: 1, broker_id: 'orrnn', broker_name: 'ORRNN', server: 'RTX5-Live',
  server_url: 'https://orrnn.example', protocol: 'https', region: '',
  server_ip: '', server_port: 443, created_at: 0, ...overrides,
});

test('missing broker config uses the selected directory company and server', () => {
  assert.deepEqual(resolveAccountBrokerLabels({
    brokerId: 'orrnn', serverUrl: 'https://orrnn.example/api/v2', directory: [server()],
  }), { brokerName: 'ORRNN', serverName: 'RTX5-Live' });
});

test('matching broker config wins over cached display metadata', () => {
  assert.deepEqual(resolveAccountBrokerLabels({
    brokerId: 'orrnn', directory: [server()], savedServerName: 'Old server',
    config: { broker_id: 'ORRNN', broker_name: 'ORRNN Markets', server_name: 'ORRNN-Demo' },
  }), { brokerName: 'ORRNN Markets', serverName: 'ORRNN-Demo' });
});

test('blank and placeholder config values keep the saved session server available', () => {
  assert.deepEqual(resolveAccountBrokerLabels({
    brokerId: 'orrnn', serverUrl: 'https://orrnn.example',
    config: { broker_id: 'orrnn', broker_name: '---', server_name: '  ' },
    sessionServerName: ' RTX5-Live ', savedServerName: 'Old server',
  }), { brokerName: 'Orrnn', serverName: 'RTX5-Live' });
});

test('an old broker-id backfill cannot hide the saved server name', () => {
  assert.equal(resolveAccountBrokerLabels({
    brokerId: 'orrnn', sessionServerName: 'orrnn', savedServerName: 'RTX5-Live',
  }).serverName, 'RTX5-Live');
});

test('server selection respects the selected endpoint when a broker has multiple servers', () => {
  const directory = [server(), server({ server: 'RTX5-Demo', server_url: 'https://demo.example' })];
  assert.equal(resolveAccountBrokerLabels({
    brokerId: 'orrnn', serverUrl: 'https://demo.example', directory,
  }).serverName, 'RTX5-Demo');
  assert.equal(resolveAccountBrokerLabels({ brokerId: 'orrnn', directory }).serverName, null);
});

test('another broker or server cannot supply active-account labels', () => {
  assert.deepEqual(resolveAccountBrokerLabels({
    brokerId: 'orrnn', serverUrl: 'https://selected.example:8443/api/v2',
    directory: [server(), server({ broker_id: 'other', broker_name: 'Other Broker' })],
    config: { broker_id: 'other', broker_name: 'Other Broker', server_name: 'Other-Live' },
  }), { brokerName: 'ORRNN', serverName: 'selected.example:8443' });
});

test('no available metadata stays unavailable rather than inventing a company or server', () => {
  assert.deepEqual(resolveAccountBrokerLabels({ brokerId: '' }), {
    brokerName: null, serverName: null,
  });
});
