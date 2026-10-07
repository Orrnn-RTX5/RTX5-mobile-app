import assert from 'node:assert/strict';
import test from 'node:test';
import { parseBrokerDirectoryListingPayload, readReportedBrokerIdentities } from '../../api/broker';
import { getDemoBrokerOptions } from './demoBrokerOptions';

const row = (id: string, name: string) => ({
  id: 1, broker_id: id, broker_name: name, protocol: 'https', server: 'broker.example.com:443', server_ip: '198.18.0.1', server_port: 443,
  server_url: 'https://broker.example.com', feed_wss_url: 'wss://broker.example.com/ws/feed',
  feed_status_https_url: 'https://broker.example.com/ws/feed/status', created_at: 1,
});

test('dropdown membership and names come only from the primary response, including future brokers', () => {
  const primaryRows = [row('future-broker', 'New Backend Broker'), row('other-broker', 'Another Backend Broker')];
  const directory = parseBrokerDirectoryListingPayload([...primaryRows, row('secondary-only', 'Secondary Broker')]);
  const primary = parseBrokerDirectoryListingPayload(primaryRows);
  const options = getDemoBrokerOptions({ ...directory, reportedBrokers: readReportedBrokerIdentities(primaryRows), primarySelectableServers: primary.selectableServers });
  assert.deepEqual(options.map(option => [option.brokerId, option.name]), [
    ['future-broker', 'New Backend Broker'], ['other-broker', 'Another Backend Broker'],
  ]);
  assert.ok(options.every(option => option.server));
  assert.deepEqual(getDemoBrokerOptions(undefined), []);
  assert.deepEqual(getDemoBrokerOptions({ ...directory, reportedBrokers: [], primarySelectableServers: [] }), []);
});

test('returned identities remain visible without using labels or secondary endpoints to authorize selection', () => {
  const reported = readReportedBrokerIdentities([row('Unavailable', 'Backend Display Name')]);
  const secondary = parseBrokerDirectoryListingPayload([row('Unavailable', 'Secondary Display Name')]);
  const options = getDemoBrokerOptions({ ...secondary, reportedBrokers: reported, primarySelectableServers: [] });
  assert.equal(options.length, 1);
  assert.equal(options[0].name, 'Backend Display Name');
  assert.equal(options[0].server, undefined);
});

test('display identities contain no routing values and omit disabled, malformed and duplicate records', () => {
  const identities = readReportedBrokerIdentities([
    row('Exact-ID', 'Backend Name'), row('Exact-ID', 'Duplicate'),
    { ...row('disabled', 'Disabled'), enabled: false }, { ...row('inactive', 'Inactive'), active: false },
    { broker_id: 'missing-name' }, { broker_name: 'missing-id' }, null,
  ]);
  assert.deepEqual(identities, [{ kind: 'identity_only', id: '1', brokerId: 'Exact-ID', brokerName: 'Backend Name' }]);
  assert.ok(Object.isFrozen(identities));
  assert.ok(Object.isFrozen(identities[0]));
});
