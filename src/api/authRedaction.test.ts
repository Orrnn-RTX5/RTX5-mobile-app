import assert from 'node:assert/strict';
import test from 'node:test';

import {
  redactAuthPayload,
  redactSensitiveString,
} from './authRedaction';

test('redactAuthPayload removes auth secrets from nested login payloads', () => {
  assert.deepEqual(
    redactAuthPayload({
      access_token: 'jwt',
      refreshToken: 'refresh',
      account_login: 160000,
      feed: {
        feedToken: 'feed-secret',
        status: 'ok',
      },
      user: {
        name: 'Trader',
        password: 'secret',
      },
    }),
    {
      access_token: '[redacted]',
      refreshToken: '[redacted]',
      account_login: 160000,
      feed: {
        feedToken: '[redacted]',
        status: 'ok',
      },
      user: {
        name: 'Trader',
        password: '[redacted]',
      },
    },
  );
});

test('redaction treats auth/header/cookie keys case-insensitively', () => {
  assert.deepEqual(
    redactAuthPayload({
      Authorization: 'Bearer access-secret',
      'SET-COOKIE': 'session=secret',
      Feed_Broker_Token: 'feed-secret',
      nested: {
        CLIENT_SECRET: 'client-secret',
        status: 'ok',
      },
    }),
    {
      Authorization: '[redacted]',
      'SET-COOKIE': '[redacted]',
      Feed_Broker_Token: '[redacted]',
      nested: {
        CLIENT_SECRET: '[redacted]',
        status: 'ok',
      },
    },
  );
});

test('redaction treats prefixed structured credential headers as secrets', () => {
  assert.deepEqual(
    redactAuthPayload({
      'x-api-key': 'api-secret',
      'x-auth-token': 'auth-secret',
      'x-feed-token': 'feed-secret',
      'vendor-session-token': 'session-secret',
      'x-request-id': 'safe-request-id',
    }),
    {
      'x-api-key': '[redacted]',
      'x-auth-token': '[redacted]',
      'x-feed-token': '[redacted]',
      'vendor-session-token': '[redacted]',
      'x-request-id': 'safe-request-id',
    },
  );
});

test('redaction removes query, bearer, header, cookie, and JSON-string secrets', () => {
  const input = [
    'wss://services.example/ws/feed?broker_id=demo&token=feed-secret&symbol=XAUUSD',
    'Authorization: Bearer access-secret',
    'Cookie: session=abc; refresh_token=cookie-refresh',
    '{"refreshToken":"refresh-secret","status":"failed"}',
  ].join('\n');
  const redacted = redactSensitiveString(input);

  assert.doesNotMatch(redacted, /feed-secret|access-secret|cookie-refresh|refresh-secret|session=abc/);
  assert.match(redacted, /token=\[redacted\]/);
  assert.match(redacted, /Authorization: \[redacted\]/);
  assert.match(redacted, /Cookie: \[redacted\]/);
  assert.match(redacted, /refreshToken"?:\[redacted\]/);
});

test('redaction sanitizes secret-bearing error messages and stacks', () => {
  const error = new Error('feed failed at wss://example.test/ws?token=feed-secret');
  const redacted = redactAuthPayload({ error }) as { error: { message: string; stack: string } };

  assert.doesNotMatch(redacted.error.message, /feed-secret/);
  assert.doesNotMatch(redacted.error.stack, /feed-secret/);
});

test('redaction removes every URL query value even for backend-defined credential names', () => {
  const redacted = redactSensitiveString(
    'wss://services.example/ws/feed?jwt=secret-jwt&sig=secret-signature&symbol=EURUSD',
  );

  assert.doesNotMatch(redacted, /secret-jwt|secret-signature|EURUSD/);
  assert.match(redacted, /jwt=\[redacted\]/);
  assert.match(redacted, /sig=\[redacted\]/);
  assert.match(redacted, /symbol=\[redacted\]/);
});
