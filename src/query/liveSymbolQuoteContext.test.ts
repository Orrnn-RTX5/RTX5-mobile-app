import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

import { resolveContextBoundLiveSymbolQuote } from './liveSymbolQuoteContext';

test('keeps a live quote only when it belongs to the requested symbol', () => {
  const quote = { symbol: 'AUDCHF', bid: 0.5732, ask: 0.5733 };

  assert.equal(resolveContextBoundLiveSymbolQuote('audchf', quote), quote);
});

test('rejects the previous symbol snapshot during a symbol transition', () => {
  const previousQuote = { symbol: 'XAUUSD', bid: 4385.06, ask: 4385.11 };

  assert.equal(resolveContextBoundLiveSymbolQuote('AUDCHF', previousQuote), undefined);
  assert.equal(resolveContextBoundLiveSymbolQuote('AUDCHF', undefined), undefined);
});

test('both public and authenticated live-quote branches stay context-bound', () => {
  const source = fs.readFileSync(path.join(__dirname, 'websocket.ts'), 'utf8');

  assert.match(
    source,
    /return active && quoteOwnerContextKey === quoteContextKey\s*\? resolveContextBoundLiveSymbolQuote\(symbol, quote\)\s*:\s*undefined;/,
  );
  assert.match(
    source,
    /return liveQuoteOwnerContextKey === liveQuoteContextKey\s*\? resolveContextBoundLiveSymbolQuote\(symbol, liveQuote\)\s*:\s*undefined;/,
  );
  assert.match(source, /if \(!active\) return undefined;/);
  assert.match(source, /if \(isPublicDemoActive\) \{\s*return resolveContextBoundLiveSymbolQuote\(symbol, publicDemoQuote\);\s*\}/);
  assert.match(source, /const liveQuoteContextKey = `\$\{isActive \? 'active' : 'inactive'\}:\$\{credentialScopeKey\}:\$\{normalizedSymbol\}`;/);
});
