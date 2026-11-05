import assert from 'node:assert/strict';
import test from 'node:test';

import { redactMarketSocketUrl } from './quoteSocketDiagnostics';

test('quote socket diagnostics retain only scheme, host, and path', () => {
  const sanitized = redactMarketSocketUrl(
    'wss://service.example/ws/feed?token=synthetic-secret&broker_id=broker-a#fragment',
  );

  assert.equal(sanitized, 'wss://service.example/ws/feed');
  assert.doesNotMatch(sanitized, /token|broker_id|synthetic-secret|fragment/);
});
