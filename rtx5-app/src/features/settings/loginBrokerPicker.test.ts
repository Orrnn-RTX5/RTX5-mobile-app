import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { createLoginBrokerPickerStore } from './loginBrokerPickerStore.ts';

test('broker picker store notifies subscribers only on real open/close changes', () => {
  const store = createLoginBrokerPickerStore();
  let notifications = 0;
  const unsubscribe = store.subscribe(() => {
    notifications += 1;
  });

  assert.equal(store.isOpen(), false);
  store.open();
  store.open();
  assert.equal(store.isOpen(), true);
  assert.equal(notifications, 1);

  store.close();
  store.close();
  assert.equal(store.isOpen(), false);
  assert.equal(notifications, 2);

  unsubscribe();
  store.open();
  assert.equal(notifications, 2);
});

test('opening the login broker picker does not re-render the login screen', () => {
  const source = readFileSync(join(process.cwd(), 'app/login.tsx'), 'utf8');
  const handlerStart = source.indexOf('const handleBrokerPickerPress = () => {');
  const handler = source.slice(handlerStart, source.indexOf('const handleRegisterAccountPress', handlerStart));

  assert.match(handler, /brokerPickerStore\.open\(\)/);
  // The empty-list retry flips query state (a full screen render), so it must
  // start after the sheet's first frame instead of inside the touch handler.
  assert.match(handler, /requestAnimationFrame\(\(\) => \{\s*void refetchBrokerServers\(\);/);
  assert.doesNotMatch(handler, /set[A-Z]\w*\(/);
});
