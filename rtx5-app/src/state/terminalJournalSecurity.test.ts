import assert from 'node:assert/strict';
import test from 'node:test';

import { sanitizeTerminalJournalMessage } from './terminalJournalSecurity';

test('persistent terminal journal strips payload secrets and arbitrary URL query values', () => {
  const sanitized = sanitizeTerminalJournalMessage(
    'login failed Authorization: Bearer access-secret\n' +
    'wss://services.example/ws/feed?jwt=feed-secret&broker_id=broker-a',
  );

  assert.doesNotMatch(sanitized, /access-secret|feed-secret|broker-a/);
  assert.match(sanitized, /Authorization: \[redacted\]/);
  assert.match(sanitized, /jwt=\[redacted\]/);
});
