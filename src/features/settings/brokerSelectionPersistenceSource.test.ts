import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
test('every broker picker resolves supported identity and enters selected-broker guest browsing', () => {
  for (const path of ['src/features/settings/BrokersScreen/BrokersScreen.tsx', 'src/features/settings/BrokersLaunchHost.tsx', 'app/settings/brokers.tsx']) {
    const source = readSource(path);
    assert.match(source, /selectedBrokerHealthGate\.run\(/);
    assert.match(source, /selectGuestBroker(?:ById)?\(/);
    assert.match(source, /replace\('\/\(tabs\)\/quotes'\)/);
    assert.doesNotMatch(source, /setBrokerConnection\(broker\.brokerId, broker\.serverUrl/);
  }
  const service = readSource('src/services/selectGuestBroker.ts');
  assert.match(service, /getBrokerDirectoryForBroker\(brokerId\)/);
  assert.match(service, /row\.broker_id === brokerId/);
  assert.match(service, /const logout = tryPrepareGuestBrokerSelection\(\) \? null : logoutBrokerSession\(\)/);
  assert.match(service, /if \(logout\) await logout/);
  assert.ok(service.indexOf('await logout') < service.indexOf('setPublicBrokerContext(record)'));
});
