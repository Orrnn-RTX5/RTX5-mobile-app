import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const source = readFileSync(resolve(process.cwd(), 'src/query/orders.ts'), 'utf8');

test('order executor never delivers a completion callback to a later broker epoch', () => {
  const start = source.indexOf('export const usePlaceOrderExecutor');
  const executor = source.slice(start);

  assert.match(
    executor,
    /\.then\(\(\{ data, owner: settledOwner \}\) => \{\s*const currentOwner = captureActiveBrokerSessionOwnerStamp\(\);\s*if \([\s\S]*currentOwner\.cacheNamespace !== settledOwner\.cacheNamespace[\s\S]*return;[\s\S]*options\.onSuccess\?\.\(data\);/,
  );
  assert.match(
    executor,
    /\}, \(error\) => \{\s*const currentOwner = captureActiveBrokerSessionOwnerStamp\(\);\s*if \(!currentOwner \|\| currentOwner\.cacheNamespace !== cacheNamespace\) return;\s*callOnError\(error\);/,
  );
  assert.match(executor, /callOnError\(new StaleBrokerSessionError\(\)\);\s*callOnSettled\(\);/);
  assert.match(executor, /\.finally\(\(\) => \{\s*callOnSettled\(\);/);
  assert.doesNotMatch(executor, /\.catch\(/);
});
