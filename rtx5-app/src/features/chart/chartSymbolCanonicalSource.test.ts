import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { buildAvailableChartSymbols } from './chartBrokerSymbols';

const readSource = (relativePath: string) =>
  readFileSync(resolve(process.cwd(), relativePath), 'utf8');

test('chart symbol dropdown prefers canonical uppercase broker symbols', () => {
  for (const sourcePath of [
    'src/features/chart/ChartScreen.native.tsx',
    'src/features/chart/ChartScreen.web.tsx',
  ]) {
    const source = readSource(sourcePath);

    assert.match(source, /import \{ buildAvailableChartSymbols, resolveBrokerChartSymbol \} from '\.\/chartBrokerSymbols'/, sourcePath);
  }
  assert.deepEqual(buildAvailableChartSymbols('eurusd', ['eurusd', 'EURUSD', 'XAUUSD.pro']),
    ['EURUSD', 'XAUUSD.pro']);
});
