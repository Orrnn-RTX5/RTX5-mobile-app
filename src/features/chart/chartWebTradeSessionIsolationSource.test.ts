import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const source = readFileSync(
  resolve(process.cwd(), 'src/features/chart/ChartScreen.web.tsx'),
  'utf8',
);

test('web chart trade callbacks cannot render a prior broker epoch result', () => {
  const start = source.indexOf('const LiveTradeButtons');
  const end = source.indexOf('const ChartToolbar', start);
  const buttons = source.slice(start, end);

  assert.match(buttons, /const actionProvenance = captureActiveBrokerSessionProvenance\(\)/);
  assert.match(buttons, /String\(tradingLogin\) !== actionProvenance\.identity\.accountLogin/);
  assert.match(
    buttons,
    /onSuccess: \(data: any\) => \{\s*if \(!isActiveBrokerSessionProvenanceCurrent\(actionProvenance\)\)/,
  );
  assert.match(
    buttons,
    /onError: \(err: any\) => \{\s*if \(!isActiveBrokerSessionProvenanceCurrent\(actionProvenance\)\)/,
  );
});
