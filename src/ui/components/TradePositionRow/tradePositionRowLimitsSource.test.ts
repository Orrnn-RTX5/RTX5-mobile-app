import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const rowSource = readFileSync(resolve(process.cwd(), 'src/ui/components/TradePositionRow/TradePositionRow.tsx'), 'utf8');
const styleSource = readFileSync(resolve(process.cwd(), 'src/ui/components/TradePositionRow/styles.ts'), 'utf8');

test('expanded trade row limits show actual SL and TP values when present', () => {
  assert.match(rowSource, /function formatTradeLimits\(item: PositionItem\): string/);
  assert.match(rowSource, /return `SL \$\{slText \?\? '--'\} \/ TP \$\{tpText \?\? '--'\}`;/);
  assert.match(rowSource, /const limitsText = formatTradeLimits\(item\);/);
  assert.match(rowSource, /\{limitsText\}/);
  assert.doesNotMatch(rowSource, /<Text style=\{\[styles\.detailValue, \{ color: T\.accent \}\]\}>\s*SL \/ TP\s*<\/Text>/);
  assert.match(styleSource, /limitsValue: \{\s*lineHeight: 18,/);
});
