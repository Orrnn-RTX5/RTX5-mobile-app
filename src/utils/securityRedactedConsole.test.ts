import assert from 'node:assert/strict';
import test from 'node:test';

import { installSecurityRedactedConsole } from './securityRedactedConsole';

test('global console defense redacts every method, avoids Expo overlays, and installs once', () => {
  const calls: Record<string, unknown[][]> = {
    debug: [], error: [], info: [], log: [], warn: [],
  };
  const target = {
    debug: (...args: unknown[]) => calls.debug.push(args),
    error: (...args: unknown[]) => calls.error.push(args),
    info: (...args: unknown[]) => calls.info.push(args),
    log: (...args: unknown[]) => calls.log.push(args),
    warn: (...args: unknown[]) => calls.warn.push(args),
  };

  installSecurityRedactedConsole(target);
  installSecurityRedactedConsole(target);
  target.error('Authorization: Bearer secret-access', { token: 'secret-feed' });
  target.warn('refresh token=secret-refresh');

  assert.equal(calls.error.length, 0);
  assert.equal(calls.warn.length, 0);
  assert.equal(calls.log.length, 2);
  assert.equal(calls.log[0]?.[0], '[console.error]');
  assert.equal(calls.log[1]?.[0], '[console.warn]');
  const serialized = JSON.stringify(calls.log);
  assert.doesNotMatch(serialized, /secret-access|secret-feed/);
  assert.doesNotMatch(serialized, /secret-refresh/);
  assert.match(serialized, /\[redacted\]/);
});
