import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveDemoAccountPolicy } from './demoAccountPolicy';

test('the demo form prefers the superadmin directory name and uses backend leverage without inventing a group', () => {
  assert.deepEqual(resolveDemoAccountPolicy({ broker_name: 'Backend Broker', default_leverage: 75, group: 'not-public-policy' }, 'Directory Broker'), {
    brokerName: 'Directory Broker', leverage: 75, group: '',
  });
  assert.deepEqual(resolveDemoAccountPolicy(null, 'Directory Broker'), {
    brokerName: 'Directory Broker', leverage: undefined, group: '',
  });
  assert.equal(resolveDemoAccountPolicy({ broker_name: 'Backend Broker' }, '').brokerName, 'Backend Broker');
});

test('the created account uses the actual registration policy instead of public defaults', () => {
  const config = { broker_name: 'Config Broker', default_leverage: 100 };
  for (const [group, leverage] of [['demo/group-A', 50], ['demo/group-B', 200]] as const) {
    assert.deepEqual(resolveDemoAccountPolicy(config, 'Directory Broker', { broker_name: 'Runtime Broker', group, leverage }), {
      brokerName: 'Directory Broker', leverage, group,
    });
  }
  // A missing account field must not be presented as the default policy.
  assert.equal(resolveDemoAccountPolicy(config, 'Directory Broker', { group: 'demo/group-C' }).leverage, undefined);
  assert.equal(resolveDemoAccountPolicy(config, '', { broker_name: 'Runtime Broker' }).brokerName, 'Runtime Broker');
});

test('missing or invalid policy values stay unavailable and never produce fabricated leverage', () => {
  for (const value of [null, undefined, '', ' ', true, false, 0, -10, NaN, Infinity, {}, 'invalid']) {
    assert.equal(resolveDemoAccountPolicy({ default_leverage: value }, '').leverage, undefined);
  }
  assert.equal(resolveDemoAccountPolicy({ default_leverage: '250' }, '').leverage, 250);
  assert.deepEqual(resolveDemoAccountPolicy({ broker_name: 123 }, '', { broker_name: {}, group: false, leverage: null }), {
    brokerName: '', group: '', leverage: undefined,
  });
});
