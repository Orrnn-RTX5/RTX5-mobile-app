import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
test('account-add broker pickers open the selected broker form without a Quotes redirect or logout', () => {
  for (const path of ['src/features/settings/BrokersScreen/BrokersScreen.tsx', 'src/features/settings/BrokersLaunchHost.tsx', 'app/settings/brokers.tsx']) {
    const source = readSource(path);
    assert.match(source, /selectedBrokerHealthGate\.run\(/);
    assert.match(source, /selectGuestBroker(?:ById)?\(/);
    assert.match(source, /openAuthFlow\(undefined, undefined, '\/settings\/brokers'\)/);
    assert.doesNotMatch(source, /replace\('\/\(tabs\)\/quotes'\)|logoutBrokerSession|\.logout\(/);
    assert.doesNotMatch(source, /setBrokerConnection\(broker\.brokerId, broker\.serverUrl/);
  }
  const service = readSource('src/services/selectGuestBroker.ts');
  assert.match(service, /getBrokerDirectoryForBroker\(brokerId\)/);
  assert.match(service, /row\.broker_id === brokerId/);
  assert.doesNotMatch(service, /logoutBrokerSession/);
  assert.match(service, /if \(!preferences.isLoggedIn && !captureActiveBrokerSession\(\)\)/);
  assert.match(readSource('src/features/settings/BrokersScreen/BrokersScreen.tsx'), /return \(\) => \{ brokerPickerFocusedRef.current = false; \};/);
});
