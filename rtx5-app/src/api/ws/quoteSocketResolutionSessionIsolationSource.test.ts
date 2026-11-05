import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const source = readFileSync(
  resolve(process.cwd(), 'src/api/ws/quotesSocket/QuotesWebSocketService.ts'),
  'utf8',
);

test('late quote-socket URL resolution cannot mutate a later broker session', () => {
  assert.match(source, /private socketResolutionGeneration = 0/);
  assert.match(source, /const resolutionGeneration = \+\+this\.socketResolutionGeneration/);
  assert.ok(
    (source.match(/if \(resolutionGeneration !== this\.socketResolutionGeneration\) return;/g) ?? []).length >= 2,
  );
  assert.match(
    source,
    /catch \(error\) \{[\s\S]*?if \(isActiveBrokerSessionOwnerStampCurrent\(owner\)\) \{[\s\S]*?this\.pendingBrokerMarketBlockReason/,
  );
  assert.match(
    source,
    /public disconnect\(\): void \{[\s\S]*?this\.socketResolutionGeneration \+= 1;[\s\S]*?this\.isResolvingSocketUrl = false;[\s\S]*?this\.pendingBrokerMarketBlockReason = null;/,
  );
});
