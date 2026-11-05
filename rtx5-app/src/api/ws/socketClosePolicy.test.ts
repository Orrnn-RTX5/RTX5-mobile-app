import assert from 'node:assert/strict';
import test from 'node:test';

import { isSocketAuthenticationFailure } from './socketClosePolicy';

test('only approved authentication close codes stop reconnect', () => {
  assert.equal(isSocketAuthenticationFailure(1008), true);
  assert.equal(isSocketAuthenticationFailure(4001), true);
  assert.equal(isSocketAuthenticationFailure(1006), false);
  assert.equal(isSocketAuthenticationFailure(undefined), false);
});
