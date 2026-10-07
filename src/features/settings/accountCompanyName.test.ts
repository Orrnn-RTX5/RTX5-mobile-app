import assert from 'node:assert/strict';
import test from 'node:test';

import {
  humanizeBrokerId,
  resolveAccountCompanyName,
} from './accountCompanyName';

test('the directory broker_name wins when present', () => {
  assert.equal(resolveAccountCompanyName('Trivanta Markets', 'trivanta-markets'), 'Trivanta Markets');
  assert.equal(resolveAccountCompanyName('  ORRNN  ', 'Orrnn'), 'ORRNN');
});

test('a session without a directory row falls back to its broker id', () => {
  assert.equal(resolveAccountCompanyName(undefined, 'orrnn-demo'), 'Orrnn Demo');
  assert.equal(resolveAccountCompanyName(null, 'trivanta-markets'), 'Trivanta Markets');
  assert.equal(resolveAccountCompanyName('   ', 'gta_broker'), 'Gta Broker');
});

test('no broker identity at all omits the line instead of a placeholder', () => {
  assert.equal(resolveAccountCompanyName(undefined, undefined), null);
  assert.equal(resolveAccountCompanyName('', '  '), null);
  assert.equal(resolveAccountCompanyName(null, null), null);
});

test('humanizing keeps ids readable without inventing words', () => {
  assert.equal(humanizeBrokerId('achiever-financials'), 'Achiever Financials');
  assert.equal(humanizeBrokerId('myprop_trade'), 'Myprop Trade');
  assert.equal(humanizeBrokerId('Orrnn'), 'Orrnn');
});
