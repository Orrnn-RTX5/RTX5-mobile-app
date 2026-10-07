import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import { createTradingApiError } from '../../api/tradingErrors';
import { runBulkClose } from './bulkClose';

test('503 ENGINE_CLOSE_UNAVAILABLE on the first close stops the batch without retries', async () => {
  const attempted: number[] = [];
  const summary = await runBulkClose([1, 2, 3, 4], async (ticket) => {
    attempted.push(ticket);
    throw createTradingApiError(503, {
      error: 'ENGINE_CLOSE_UNAVAILABLE',
      message: 'engine close unavailable',
    });
  });
  assert.deepEqual(attempted, [1], 'only one close is sent');
  assert.equal(summary.failed, 4);
  assert.ok(summary.stopError);
  assert.deepEqual(
    summary.results.map((result) => result.status === 'rejected' && result.skipped),
    [false, true, true, true],
  );
});

test('ordinary failures do not stop the rest of the batch', async () => {
  const attempted: number[] = [];
  const summary = await runBulkClose([1, 2, 3], async (ticket) => {
    attempted.push(ticket);
    if (ticket === 1) {
      throw createTradingApiError(409, { error: 'POSITION_STATE_CHANGED', message: 'changed' });
    }
  });
  assert.deepEqual(attempted.sort(), [1, 2, 3]);
  assert.equal(summary.failed, 1);
  assert.equal(summary.stopError, null);
});

test('an engine outage later in the batch is still reported once', async () => {
  const summary = await runBulkClose([1, 2], async (ticket) => {
    if (ticket === 2) {
      throw createTradingApiError(503, { error: 'ENGINE_CLOSE_UNAVAILABLE', message: 'x' });
    }
  });
  assert.equal(summary.failed, 1);
  assert.ok(summary.stopError);
});

test('BulkOperationScreen uses the stop-rule runner and shows the classified outage message', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/features/trade/BulkOperationScreen.tsx'),
    'utf8',
  );
  assert.match(source, /await runBulkClose\(\s*snapshots,\s*\(position\) => positionsApi\.closePosition\(position\.id\),/);
  assert.doesNotMatch(source, /Promise\.allSettled\(/);
  assert.match(source, /if \(stopError\) \{[\s\S]*classifyTradingError\(stopError, \{ action: 'close-position' \}\)/);
});
