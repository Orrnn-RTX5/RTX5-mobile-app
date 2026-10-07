import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const source = readFileSync(
  resolve(process.cwd(), 'src/api/ws/quotesSocket/QuotesWebSocketService.ts'),
  'utf8',
);

test('feed status is probed on demand only (60 s silence), never polled, and suspended in background', () => {
  // Contract v3: no periodic health polling and no socket stop from the status endpoint.
  assert.doesNotMatch(source, /scheduleHealthProbe|healthProbeTimer/);
  assert.doesNotMatch(source, /await probeActiveFeedHealth/);
  assert.match(
    source,
    /private checkMarketThenReconnectAfterSilence\(now: number\): void \{[\s\S]*void probeActiveFeedHealth\(owner\)/,
  );
  assert.match(source, /if \(!this\.isAppActive\) \{[\s\S]*cancelActiveFeedHealthProbe\(\)/);
  assert.match(source, /!this\.hasActiveDemand\(\)/);
});
