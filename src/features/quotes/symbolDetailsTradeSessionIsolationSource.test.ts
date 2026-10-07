import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const source = readFileSync(
  resolve(process.cwd(), 'src/features/quotes/SymbolDetailsScreen/SymbolDetailsScreen.tsx'),
  'utf8',
);

test('symbol-details order callbacks are bound to their originating broker epoch', () => {
  const start = source.indexOf('const handleTrade');
  const end = source.indexOf('\n  return (', start);
  const handler = source.slice(start, end);

  assert.match(handler, /const actionProvenance = captureActiveBrokerSessionProvenance\(\)/);
  assert.match(handler, /String\(tradingLogin\) !== actionProvenance\.identity\.accountLogin/);
  assert.match(
    handler,
    /onSuccess: \(data\) => \{\s*if \(!isActiveBrokerSessionProvenanceCurrent\(actionProvenance\)\)/,
  );
  assert.match(
    handler,
    /onError: \(err: any\) => \{\s*if \(!isActiveBrokerSessionProvenanceCurrent\(actionProvenance\)\)/,
  );
});
