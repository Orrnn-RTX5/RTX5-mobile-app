import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('history summary and control cards use the accounts live card shell', () => {
  const source = readSource('src/features/history/HistoryScreen.tsx');
  const summaryStart = source.indexOf('summaryBlock: {');
  const summaryEnd = source.indexOf('summaryTop:', summaryStart);
  const detailsStart = source.indexOf('summaryDetailsCard: {');
  const detailsEnd = source.indexOf('gridRow:', detailsStart);
  const topBlockStart = source.indexOf('topBlock: {');
  const topBlockEnd = source.indexOf('topControlsRow:', topBlockStart);
  const summaryStyle = source.slice(summaryStart, summaryEnd);
  const detailsStyle = source.slice(detailsStart, detailsEnd);
  const topBlockStyle = source.slice(topBlockStart, topBlockEnd);

  assert.notEqual(summaryStart, -1);
  assert.notEqual(summaryEnd, -1);
  assert.notEqual(detailsStart, -1);
  assert.notEqual(detailsEnd, -1);
  assert.notEqual(topBlockStart, -1);
  assert.notEqual(topBlockEnd, -1);

  for (const styleSource of [summaryStyle, detailsStyle, topBlockStyle]) {
    assert.match(styleSource, /borderRadius: 16/);
    assert.match(styleSource, /borderWidth: 1/);
    assert.match(styleSource, /borderColor: T\.border/);
    assert.match(styleSource, /shadowColor: isDark \? '#000000' : '#64748B'/);
    assert.match(styleSource, /shadowOffset: \{ width: 0, height: isDark \? 4 : 2 \}/);
    assert.match(styleSource, /shadowOpacity: isDark \? 0\.08 : 0\.06/);
    assert.match(styleSource, /shadowRadius: isDark \? 16 : 8/);
    assert.match(styleSource, /elevation: isDark \? 4 : 1/);
    assert.doesNotMatch(styleSource, /T\.borderSubtle|#0F172A|height: isDark \? 4 : 8|shadowRadius: isDark \? 16 : 24/);
  }
});

test('history summary preserves the backend balance cents', () => {
  const source = readSource('src/features/history/HistoryScreen.tsx');

  assert.match(source, /\{fmt\.decimal\(balance\)\}/);
  assert.doesNotMatch(source, /\{fmt\.int\(balance\)\}/);
});
