import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const hookSource = readFileSync(
  resolve(process.cwd(), 'src/features/trade/OrderTickExecutionGraph/useOrderExecutionTicks.ts'),
  'utf8',
);
const helperSource = readFileSync(
  resolve(process.cwd(), 'src/features/trade/OrderTickExecutionGraph/tickHelpers.ts'),
  'utf8',
);

test('authenticated tick graphs never synthesize price history or idle demo ticks', () => {
  assert.doesNotMatch(hookSource, /createDemoTick|scheduleDemoTick|demoTimer|Math\.random/);
  assert.doesNotMatch(helperSource, /createDemoTick|randomBetween|Math\.random|Math\.sin|Math\.cos/);
  assert.match(helperSource, /return \[latestTick\];/);
});
