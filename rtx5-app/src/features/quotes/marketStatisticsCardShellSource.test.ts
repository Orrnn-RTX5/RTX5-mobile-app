import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('market statistics cards use the accounts live card shell', () => {
  const source = readSource('src/features/quotes/MarketStatisticsScreen/styles.ts');
  const styleNames = ['heroPanel', 'sectionPanel', 'rangePanel', 'sentimentPanel'];

  for (const styleName of styleNames) {
    const styleStart = source.indexOf(`${styleName}: {`);
    const styleEnd = source.indexOf('\n    },', styleStart);
    const styleSource = source.slice(styleStart, styleEnd);

    assert.notEqual(styleStart, -1, `${styleName} style should exist`);
    assert.notEqual(styleEnd, -1, `${styleName} style should close`);
    assert.match(styleSource, /borderRadius: 16/);
    assert.match(styleSource, /borderWidth: 1/);
    assert.match(styleSource, /borderColor: T\.border/);
    assert.match(styleSource, /shadowColor: isDark \? '#000000' : '#64748B'/);
    assert.match(styleSource, /shadowOffset: \{ width: 0, height: isDark \? 4 : 2 \}/);
    assert.match(styleSource, /shadowOpacity: isDark \? 0\.08 : 0\.06/);
    assert.match(styleSource, /shadowRadius: isDark \? 16 : 8/);
    assert.match(styleSource, /elevation: isDark \? 4 : 1/);
    assert.doesNotMatch(styleSource, /borderColor,|shadowColor,|height: 8|height: 10|shadowRadius: (18|24)|elevation: [23]/);
  }
});
