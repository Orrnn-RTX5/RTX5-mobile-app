import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const source = readFileSync(resolve(process.cwd(), 'src/query/marketStatus.ts'), 'utf8');

test('market status cache keys isolate broker/account namespaces and exact symbols', () => {
  assert.match(
    source,
    /getMarketStatusQueryKey = \(\s*cacheNamespace: string,\s*symbol: string,[\s\S]*\[MARKET_STATUS_KEY, cacheNamespace, symbol\]/,
  );
});

test('market status fetch is session-bound and hidden polling remains disabled', () => {
  assert.match(source, /runSessionBoundQuery\(\s*cacheNamespace,/);
  assert.match(source, /refetchInterval: isPollingEnabled \? 30_000 : false/);
  assert.match(source, /refetchOnWindowFocus: isPollingEnabled/);
  assert.match(source, /refetchOnReconnect: isPollingEnabled/);
});
