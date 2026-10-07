import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { parseBrokerDirectoryListingPayload } from '../../api/broker';
import { getPublicBrokerContext, setPublicBrokerContext } from '../../state/publicBrokerContext';
import { publicBrokerFixture } from '../../testFixtures/publicBroker';
import { resolveStartupGuestBroker } from './startupGuestBroker';

const server = (id: string) => {
  const result = parseBrokerDirectoryListingPayload([{
    id: 1, broker_id: id, broker_name: id, protocol: 'https',
    server: 'broker.example.com:443', server_ip: '198.18.0.1', server_port: 443, created_at: 1,
    server_url: 'https://broker.example.com',
    feed_wss_url: 'wss://broker.example.com/ws/feed',
    feed_status_https_url: 'https://broker.example.com/ws/feed/status',
  }]).selectableServers[0];
  assert.ok(result?.directory_source === 'v2_raw');
  return result;
};

test('fresh Quotes startup can choose a verified guest feed without broker search', () => {
  const first = server('First');
  const second = server('Second');
  assert.ok(first);
  assert.equal(resolveStartupGuestBroker([first, second]), first);
});

test('guest startup skips insecure, disabled and unsupported feeds', () => {
  const valid = server('Supported');
  const disabled = { ...server('Disabled'), active: false };
  const bridge = { ...server('Bridge'), protocol_mode: 'bridge' };
  assert.equal(resolveStartupGuestBroker([
    { ...server('Insecure'), feed_wss_url: 'ws://broker.example.com/ws/feed' },
    disabled,
    bridge,
    valid,
  ]), valid);
});

test('an empty or unsupported directory leaves Quotes open without inventing endpoints', () => {
  assert.equal(resolveStartupGuestBroker([]), null);
  const bridge = { ...server('Bridge'), protocol_mode: 'bridge' };
  assert.equal(resolveStartupGuestBroker([bridge]), null);
});

test('resolving a startup feed does not change an existing broker context', () => {
  const existing = setPublicBrokerContext(publicBrokerFixture('Saved'));
  try {
    assert.equal(resolveStartupGuestBroker([server('Other')])?.broker_id, 'Other');
    assert.equal(getPublicBrokerContext(), existing);
  } finally {
    setPublicBrokerContext(null);
  }
});

test('the launch route stays on Quotes and broker search requires an explicit request', () => {
  const index = readFileSync(resolve(process.cwd(), 'app/index.tsx'), 'utf8');
  const host = readFileSync(resolve(process.cwd(), 'src/features/auth/GuestFlowHost.tsx'), 'utf8');
  assert.match(index, /<Redirect href='\/quotes'/);
  assert.match(host, /\[brokerPickerVisible, setBrokerPickerVisible\] = useState\(false\)/);
  assert.match(host, /<Modal visible=\{brokerPickerVisible\}/);
  assert.doesNotMatch(host, /<Modal visible=\{!context\}/);
  assert.match(host, /else if \(!isLoggedIn && !brokerPickerVisible && !startupBrokerSelectionAttempted.current\)/);
  assert.match(host, /const verified = createPublicBrokerContext\(selected\);[\s\S]*?startupBrokerSelectionAttempted.current = true;/);
  assert.match(host, /const changeBroker = \(\) => \{[\s\S]*?setBrokerPickerVisible\(true\)/);
  assert.match(host, /<GuestBrokerPicker onBack=\{\(\) => setBrokerPickerVisible\(false\)\}/);
});
