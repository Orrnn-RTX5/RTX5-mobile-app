import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('chart analytics cards use the accounts card shell', () => {
  const source = readSource('src/features/chart/ChartAnalyticsScreen.tsx');
  const cardStart = source.indexOf('card: {');
  const cardEnd = source.indexOf('cardHeaderRow:', cardStart);
  const cardStyle = source.slice(cardStart, cardEnd);

  assert.notEqual(cardStart, -1);
  assert.notEqual(cardEnd, -1);
  assert.match(cardStyle, /borderRadius: 16/);
  assert.match(cardStyle, /borderWidth: 1/);
  assert.match(cardStyle, /borderColor: T\.border/);
  assert.match(cardStyle, /shadowColor: isDark \? '#000000' : '#64748B'/);
  assert.match(cardStyle, /shadowOffset: \{ width: 0, height: isDark \? 4 : 2 \}/);
  assert.match(cardStyle, /shadowOpacity: isDark \? 0\.08 : 0\.06/);
  assert.match(cardStyle, /shadowRadius: isDark \? 16 : 8/);
  assert.match(cardStyle, /elevation: isDark \? 4 : 1/);
  assert.doesNotMatch(cardStyle, /T\.borderSubtle|shadowOpacity: isDark \? 0 : 0\.03|shadowRadius: isDark \? 0 : 10/);
});
