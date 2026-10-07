import assert from 'node:assert/strict';
import test from 'node:test';

import { isWatchlistAddAccepted } from './watchlist';

test('watchlist add accepts 200 {status:"added"} even for an existing symbol', () => {
  // Contract v3: POST /watchlist/{symbol} -> 200 {"symbol","status":"added"}.
  assert.equal(isWatchlistAddAccepted(200), true);
  assert.equal(isWatchlistAddAccepted(201), true);
  assert.equal(isWatchlistAddAccepted(204), true);
});

test('watchlist add still tolerates the legacy duplicate 400', () => {
  assert.equal(isWatchlistAddAccepted(400), true);
});

test('watchlist add surfaces real failures', () => {
  assert.equal(isWatchlistAddAccepted(401), false);
  assert.equal(isWatchlistAddAccepted(403), false);
  assert.equal(isWatchlistAddAccepted(404), false);
  assert.equal(isWatchlistAddAccepted(500), false);
});
