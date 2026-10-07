import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const source = readFileSync(
  resolve(process.cwd(), 'src/query/broker.ts'),
  'utf8',
);

test('broker directory hooks share the post-handoff versioned cache key', () => {
  assert.match(source, /BROKER_DIRECTORY_QUERY_VERSION = 5/);
  assert.match(
    source,
    /const getBrokerDirectoryQueryKey = \(\) => \[[\s\S]*BROKER_SERVERS_KEY,[\s\S]*BROKER_DIRECTORY_QUERY_VERSION/,
  );
  assert.match(
    source,
    /export function useBrokerDirectory[\s\S]*?queryKey: getBrokerDirectoryQueryKey\(\)/,
  );
  assert.match(
    source,
    /export function useBrokerServers[\s\S]*?queryKey: getBrokerDirectoryQueryKey\(\)/,
  );
});
